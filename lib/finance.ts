// Kasa & cari hesap çekirdeği — SAF fonksiyonlar (DB/React yok, doğrudan test edilebilir).
//
// TEMEL AYRIM (modülün varlık sebebi):
//   ciro / "hak edilen"  = tamamlanan (status "geldi") randevuların fiyatı
//   tahsilat / "kasaya giren" = Payment kayıtları
//   borç (cari bakiye)   = hak edilen − tahsil edilen
// Bugüne kadar rapor ekranı bu ikisini tek rakam sanıyordu; veresiye çalışan bir işletmede
// bu rakam gerçeği YANLIŞ gösteriyordu. Buradan sonra ikisi ayrı hesaplanır.

import type { BusinessState, Customer, Expense, Payment } from "./types";
import { addDaysISO, aptPrice, todayISO } from "./utils";

// ---------------------------------------------------------------------------
// Borç doğuran randevu nedir?
// ---------------------------------------------------------------------------
// Sadece GERÇEKLEŞMİŞ hizmet borç doğurur: status === "geldi".
// - "bekliyor": henüz hizmet verilmedi → borç yok.
// - "iptal": hizmet verilmedi → borç yok.
// - approval === "reddedildi": işletme talebi reddetti → hiç olmamış sayılır.
export function isBillable(a: BusinessState["appointments"][number]): boolean {
  return a.status === "geldi" && a.approval !== "reddedildi";
}

/** Bir müşterinin hak edilen (borç doğuran) toplam tutarı. */
export function customerCharged(state: BusinessState, customerId: string): number {
  return state.appointments
    .filter((a) => a.customerId === customerId && isBillable(a))
    .reduce((s, a) => s + aptPrice(state, a), 0);
}

/** Bir müşteriden tahsil edilen toplam tutar. */
export function customerPaid(state: BusinessState, customerId: string): number {
  return state.payments
    .filter((p) => p.customerId === customerId)
    .reduce((s, p) => s + p.amount, 0);
}

/**
 * Cari bakiye. Pozitif = müşteri BORÇLU. Negatif = müşterinin alacağı var
 * (fazla/avans ödeme). 0 = kapalı hesap.
 */
export function customerBalance(state: BusinessState, customerId: string): number {
  return round2(customerCharged(state, customerId) - customerPaid(state, customerId));
}

export interface CustomerBalance {
  customer: Customer;
  charged: number;
  paid: number;
  balance: number; // + borçlu, − alacaklı
  /** En eski ödenmemiş borcun gün yaşı (borcu yoksa 0). */
  oldestDebtDays: number;
}

/**
 * Tüm müşterilerin cari özeti. `onlyDebtors` ile sadece borçlular
 * (bakiye > tolerans) döner, borcu en büyükten küçüğe sıralı.
 */
export function customerBalances(
  state: BusinessState,
  opts: { onlyDebtors?: boolean; today?: string } = {}
): CustomerBalance[] {
  const today = opts.today ?? todayISO();
  const rows = state.customers.map((customer) => {
    const charged = round2(customerCharged(state, customer.id));
    const paid = round2(customerPaid(state, customer.id));
    const balance = round2(charged - paid);
    return {
      customer,
      charged,
      paid,
      balance,
      oldestDebtDays: balance > EPS ? oldestOpenDebtDays(state, customer.id, today) : 0,
    };
  });
  const list = opts.onlyDebtors ? rows.filter((r) => r.balance > EPS) : rows;
  return list.sort((a, b) => b.balance - a.balance);
}

// ---------------------------------------------------------------------------
// Yaşlandırma (aging) — FIFO mahsup
// ---------------------------------------------------------------------------
// Tahsilatların hangi borca sayılacağını bilmiyoruz (kalem bazlı eşleştirme yok).
// Muhasebe pratiğinde standart olan FIFO uygulanır: gelen para EN ESKİ borçtan düşülür.
// Böylece "3 aydır ödenmeyen" borç, yeni bir ödemeyle sahte şekilde gençleşmez.

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

export interface OpenDebt {
  appointmentId: string;
  date: string;
  amount: number; // bu randevudan KALAN (mahsup sonrası) borç
  ageDays: number;
  bucket: AgingBucket;
}

/** Müşterinin FIFO mahsup sonrası hâlâ açık kalan borç kalemleri (eskiden yeniye). */
export function openDebts(
  state: BusinessState,
  customerId: string,
  today = todayISO()
): OpenDebt[] {
  const charges = state.appointments
    .filter((a) => a.customerId === customerId && isBillable(a))
    .map((a) => ({ id: a.id, date: a.date, amount: aptPrice(state, a) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let pool = customerPaid(state, customerId);
  const out: OpenDebt[] = [];
  for (const c of charges) {
    const applied = Math.min(pool, c.amount);
    pool -= applied;
    const remaining = round2(c.amount - applied);
    if (remaining <= EPS) continue;
    const ageDays = daysBetween(c.date, today);
    out.push({
      appointmentId: c.id,
      date: c.date,
      amount: remaining,
      ageDays,
      bucket: bucketOf(ageDays),
    });
  }
  return out;
}

function oldestOpenDebtDays(state: BusinessState, customerId: string, today: string): number {
  const debts = openDebts(state, customerId, today);
  return debts.length > 0 ? debts[0]!.ageDays : 0;
}

export function bucketOf(ageDays: number): AgingBucket {
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "90+";
}

/** İşletme geneli yaşlandırma tablosu: her kovada toplam açık borç. */
export function agingSummary(
  state: BusinessState,
  today = todayISO()
): Record<AgingBucket, number> {
  const out: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const c of state.customers) {
    for (const d of openDebts(state, c.id, today)) out[d.bucket] += d.amount;
  }
  for (const k of AGING_BUCKETS) out[k] = round2(out[k]);
  return out;
}

// ---------------------------------------------------------------------------
// Cari ekstre
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  id: string;
  date: string;
  kind: "borc" | "tahsilat";
  label: string;
  amount: number; // borç: +, tahsilat: −
  running: number; // işlem sonrası bakiye
}

/** Müşterinin tarih sıralı cari ekstresi (yürüyen bakiye ile). */
export function customerLedger(state: BusinessState, customerId: string): LedgerEntry[] {
  const charges = state.appointments
    .filter((a) => a.customerId === customerId && isBillable(a))
    .map((a) => ({
      id: a.id,
      date: a.date,
      kind: "borc" as const,
      label: a.serviceNameSnapshot ?? serviceName(state, a.serviceId),
      amount: aptPrice(state, a),
    }));

  const paid = state.payments
    .filter((p) => p.customerId === customerId)
    .map((p) => ({
      id: p.id,
      date: p.date,
      kind: "tahsilat" as const,
      label: p.note?.trim() || methodLabel(p.method),
      amount: -p.amount,
    }));

  // Aynı gün: önce borç, sonra tahsilat (ödeme borcu kapatır — tersi anlamsız).
  const all = [...charges, ...paid].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "borc" ? -1 : 1)
  );

  let running = 0;
  return all.map((e) => {
    running = round2(running + e.amount);
    return { ...e, amount: round2(e.amount), running };
  });
}

function serviceName(state: BusinessState, serviceId: string): string {
  return state.services.find((s) => s.id === serviceId)?.name ?? "Hizmet";
}

export const METHOD_LABEL: Record<Payment["method"], string> = {
  nakit: "Nakit",
  kart: "Kart",
  havale: "Havale/EFT",
};
export function methodLabel(m: Payment["method"]): string {
  return METHOD_LABEL[m] ?? m;
}

export const CATEGORY_LABEL: Record<Expense["category"], string> = {
  kira: "Kira",
  maas: "Maaş",
  malzeme: "Malzeme",
  fatura: "Fatura",
  vergi: "Vergi",
  diger: "Diğer",
};
export function categoryLabel(c: Expense["category"]): string {
  return CATEGORY_LABEL[c] ?? c;
}

// ---------------------------------------------------------------------------
// Kasa özetleri (gün / dönem)
// ---------------------------------------------------------------------------

export interface CashSummary {
  from: string;
  to: string;
  /** Hak edilen (tamamlanan randevu fiyatları) — "ciro". */
  earned: number;
  /** Kasaya giren (Payment) — "tahsilat". */
  collected: number;
  /** Kasadan çıkan (Expense). */
  expenses: number;
  /** Tahsilat − gider. Ciro değil, NAKİT sonucu. */
  net: number;
  /** Tahsilatın ödeme yöntemine göre dağılımı. */
  byMethod: Record<Payment["method"], number>;
  /** Giderin kategoriye göre dağılımı. */
  byCategory: Record<Expense["category"], number>;
}

export function cashSummary(state: BusinessState, from: string, to: string): CashSummary {
  const inRange = <T extends { date: string }>(rows: T[]) =>
    rows.filter((r) => r.date >= from && r.date <= to);

  const earned = inRange(state.appointments.filter(isBillable)).reduce(
    (s, a) => s + aptPrice(state, a),
    0
  );
  const pays = inRange(state.payments);
  const exps = inRange(state.expenses);

  const byMethod: Record<Payment["method"], number> = { nakit: 0, kart: 0, havale: 0 };
  for (const p of pays) byMethod[p.method] = round2(byMethod[p.method] + p.amount);

  const byCategory: Record<Expense["category"], number> = {
    kira: 0,
    maas: 0,
    malzeme: 0,
    fatura: 0,
    vergi: 0,
    diger: 0,
  };
  for (const e of exps) byCategory[e.category] = round2(byCategory[e.category] + e.amount);

  const collected = round2(pays.reduce((s, p) => s + p.amount, 0));
  const expenseTotal = round2(exps.reduce((s, e) => s + e.amount, 0));

  return {
    from,
    to,
    earned: round2(earned),
    collected,
    expenses: expenseTotal,
    net: round2(collected - expenseTotal),
    byMethod,
    byCategory,
  };
}

/** Son `days` günün (bugün dahil) kasa özeti. */
export function rangeCashSummary(state: BusinessState, days: number, today = todayISO()): CashSummary {
  return cashSummary(state, addDaysISO(today, -(days - 1)), today);
}

/** Tek günün kasa özeti. */
export function dayCashSummary(state: BusinessState, date: string): CashSummary {
  return cashSummary(state, date, date);
}

/** İşletmenin toplam açık alacağı (tüm borçluların bakiyesi toplamı). */
export function totalReceivable(state: BusinessState): number {
  return round2(
    state.customers.reduce((s, c) => {
      const b = customerBalance(state, c.id);
      return s + (b > EPS ? b : 0);
    }, 0)
  );
}

/** Günlük tahsilat serisi (grafik için). */
export function dailyCollectedSeries(
  state: BusinessState,
  days: number,
  today = todayISO()
): { label: string; date: string; value: number }[] {
  const out: { label: string; date: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysISO(today, -i);
    const value = round2(
      state.payments.filter((p) => p.date === date).reduce((s, p) => s + p.amount, 0)
    );
    out.push({ label: date.slice(5), date, value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Borç hatırlatma mesajı (WhatsApp şablonu)
// ---------------------------------------------------------------------------

/**
 * Tek tık borç hatırlatma metni. Rakam UYDURULMAZ: bakiye ve en eski borcun tarihi
 * gerçek kayıtlardan gelir. Borcu yoksa null döner (yanlış mesaj gönderilmesin).
 */
export function debtReminderText(
  state: BusinessState,
  customerId: string,
  today = todayISO()
): string | null {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) return null;
  const balance = customerBalance(state, customerId);
  if (balance <= EPS) return null;

  const debts = openDebts(state, customerId, today);
  const oldest = debts[0];
  const amount = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(balance);

  const since = oldest ? ` (${trDate(oldest.date)} tarihinden itibaren)` : "";
  return `Merhaba ${customer.name}, ${state.businessName} olarak bilgilendirmek isteriz: güncel bakiyeniz ${amount}${since}. Uygun olduğunuzda ödeyebilirsiniz. Teşekkürler.`;
}

function trDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Kuruş yuvarlama — float toplamlarında 0.30000000000000004 tipi artıkları temizler. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Bakiye "sıfır mı" karşılaştırmasında kullanılan kuruş-altı tolerans. */
const EPS = 0.005;

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISO + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
