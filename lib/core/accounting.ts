// lib/core/accounting.ts — #20 muhasebe dışa aktarım çekirdeği (saf; tarayıcı + test).
// Yevmiye kaydı üretir (kısmet türü kuruş; borç=alacak dengeli) ve Logo/Mikro/Paraşüt/e-Defter ön verisi CSV'ye çevirir.
// Hesap kodları tek düzey şablon: mizan ayrıntısını muhasebeci kendi planına göre eşler.

export type JournalLine = { code: string; name: string; debit: number; credit: number; desc?: string };
export type JournalEntry = { no: string; date: string; desc: string; lines: JournalLine[] };

export const HESAP = {
  KASA: { code: "101", name: "Kasa" },
  BANKA: { code: "102", name: "Bankalar" },
  ALICILAR: { code: "120", name: "Alıcılar" },
  TEDARIKCILER: { code: "320", name: "Satıcılar" },
  STOK: { code: "153", name: "Ticari Mallar" },
  INDIRILECEK_KDV: { code: "191", name: "İndirilecek KDV" },
  HESAPLANAN_KDV: { code: "391", name: "Hesaplanan KDV" },
  SATISLAR: { code: "600", name: "Yurtiçi Satışlar" },
} as const;

const line = (h: { code: string; name: string }, amount: number, side: "borc" | "alacak", desc?: string): JournalLine => ({
  code: h.code, name: h.name, debit: side === "borc" ? amount : 0, credit: side === "alacak" ? amount : 0, desc,
});

export type PosDay = { date: string; gross: number; net: number; vat: number };
export type EarsivSale = { date: string; no: string; buyer: string; gross: number; net: number; vat: number };
export type RefundDoc = { date: string; no: string; gross: number; net: number; vat: number; earsiv: boolean; buyer?: string };
export type PurchaseDoc = { date: string; docNo: string; supplier: string; total: number };

export type MonthInput = { year: number; month: number; posDays: PosDay[]; earsiv: EarsivSale[]; refunds: RefundDoc[]; purchases: PurchaseDoc[] };

/** Bir satış/iade tutar üçlüsünden yevmiye satırları (satış: banka/kasa borç, satış+KDV alacak). */
function saleLines(s: { gross: number; net: number; vat: number }, cash: { code: string; name: string }, desc?: string): JournalLine[] {
  return [line(cash, s.gross, "borc", desc), line(HESAP.SATISLAR, s.net, "alacak", desc), line(HESAP.HESAPLANAN_KDV, s.vat, "alacak", desc)];
}

/** Ayın yevmiye fişleri: gün sonu POS kayıtları, e-Arşiv cari satışları, iadeler, alımlar. */
export function buildMonthlyJournal(input: MonthInput): JournalEntry[] {
  const entries: JournalEntry[] = [];
  let no = 1;
  const push = (date: string, desc: string, lines: JournalLine[]) => {
    const balanced = lines.reduce((t, l) => t + l.debit - l.credit, 0);
    if (lines.length && balanced === 0) entries.push({ no: String(no++).padStart(4, "0"), date, desc, lines });
  };
  for (const d of input.posDays) {
    if (d.gross <= 0) continue;
    push(d.date, `Gün sonu POS satışı (${d.date})`, saleLines(d, HESAP.BANKA));
  }
  for (const e of input.earsiv) {
    push(e.date, `e-Arşiv ${e.no} — ${e.buyer}`, saleLines(e, HESAP.ALICILAR, `${e.no} ${e.buyer}`));
  }
  for (const r of input.refunds) {
    const cash = r.earsiv ? HESAP.ALICILAR : HESAP.BANKA;
    const flip = (l: JournalLine): JournalLine => ({ ...l, debit: l.credit, credit: l.debit });
    const [cashLine, satis, kdv] = saleLines(r, cash, `İade ${r.no}`);
    push(r.date, `İade ${r.no}${r.earsiv && r.buyer ? ` — ${r.buyer}` : ""}`, [flip(satis!), flip(kdv!), flip(cashLine!)]);
  }
  for (const p of input.purchases) {
    // Alımlarda KDV ayrıştırması fiş kaynağında yok; genel toplam 153'e alınır, KDV bölümü muhasebecide.
    push(p.date, `Alım ${p.docNo} — ${p.supplier}`, [line(HESAP.STOK, p.total, "borc", p.docNo), line(HESAP.TEDARIKCILER, p.total, "alacak", p.supplier)]);
  }
  return entries;
}

/** CSV hücresi: ayraç/tırnak kaçışı + formül enjeksiyonu koruması (= + - @ ile başlayan değere ' koyulur). */
export function csvCell(value: string | number, sep: string): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s.includes(sep) || s.includes('"') || /[\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

const money = (kurus: number) => (kurus / 100).toFixed(2).replace(".", ",");
const day = (iso: string) => (iso.length >= 10 ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : iso);

export const PROVIDERS = ["parasut", "logo", "mikro", "edefter"] as const;
export type AccountingProvider = (typeof PROVIDERS)[number];

const HEADERS: Record<AccountingProvider, string[]> = {
  parasut: ["Fiş Tarihi", "Fiş No", "Fiş Açıklaması", "Hesap Kodu", "Hesap Adı", "Borç", "Alacak"],
  logo: ["Fiş No", "Fiş Tarihi", "Hesap Kodu", "Hesap Adı", "Borç", "Alacak", "Satır Açıklaması"],
  mikro: ["Belge No", "Tarih", "Hesap Kodu", "Borç", "Alacak", "Açıklama"],
  edefter: ["Yevmiye No", "Tarih", "Hesap Kodu", "Hesap Adı", "Borç", "Alacak", "Açıklama"],
};

/** Sağlayıcı CSV'si: fişler satır satır döner (Excel TR: ayraç noktalı virgül, ondalık virgül). */
export function toProviderCsv(entries: JournalEntry[], provider: AccountingProvider): string {
  const sep = ";";
  const rows = [HEADERS[provider].join(sep)];
  for (const e of entries) {
    for (const l of e.lines) {
      const cells: Record<AccountingProvider, (string | number)[]> = {
        parasut: [day(e.date), e.no, e.desc, l.code, l.name, money(l.debit), money(l.credit)],
        logo: [e.no, day(e.date), l.code, l.name, money(l.debit), money(l.credit), l.desc ?? e.desc],
        mikro: [e.no, day(e.date), l.code, money(l.debit), money(l.credit), l.desc ?? e.desc],
        edefter: [e.no, e.date, l.code, l.name, money(l.debit), money(l.credit), l.desc ?? e.desc],
      };
      rows.push(cells[provider].map((c) => csvCell(c, sep)).join(sep));
    }
  }
  return rows.join("\r\n") + "\r\n";
}

export const isAccountingProvider = (v: string): v is AccountingProvider => (PROVIDERS as readonly string[]).includes(v);
