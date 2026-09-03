import test from "node:test";
import assert from "node:assert/strict";

import {
  agingSummary,
  cashSummary,
  customerBalance,
  customerBalances,
  customerLedger,
  daysBetween,
  debtReminderText,
  isBillable,
  openDebts,
  totalReceivable,
} from "../lib/finance.ts";
import type { Appointment, BusinessState, Customer, Expense, Payment } from "../lib/types.ts";

// ---- Test fixture'ı: minimum ama gerçekçi bir işletme state'i ----

const TODAY = "2026-09-03";

function customer(id: string, name: string): Customer {
  return { id, name, phone: "05551112233", createdAt: "2026-01-01T00:00:00.000Z" };
}

function apt(
  id: string,
  customerId: string,
  date: string,
  price: number,
  extra: Partial<Appointment> = {}
): Appointment {
  return {
    id,
    date,
    start: "10:00",
    staffId: "stf-1",
    customerId,
    serviceId: "svc-1",
    status: "geldi",
    priceSnapshot: price,
    commissionRateSnapshot: 0.4,
    serviceNameSnapshot: "Saç kesimi",
    staffNameSnapshot: "Ali",
    ...extra,
  };
}

function payment(id: string, customerId: string, date: string, amount: number, extra: Partial<Payment> = {}): Payment {
  return {
    id,
    date,
    amount,
    method: "nakit",
    customerId,
    createdAt: date + "T12:00:00.000Z",
    ...extra,
  };
}

function expense(id: string, date: string, amount: number, category: Expense["category"] = "malzeme"): Expense {
  return { id, date, amount, category, createdAt: date + "T10:00:00.000Z" };
}

function makeState(over: Partial<BusinessState> = {}): BusinessState {
  return {
    sector: "berber",
    businessName: "Test Kuaför",
    bookingSlug: "test-kuafor",
    services: [{ id: "svc-1", name: "Saç kesimi", durationMin: 30, price: 500, commissionRate: 0.4 }],
    staff: [{ id: "stf-1", name: "Ali", role: "Usta", color: "#000", initials: "A" }],
    customers: [customer("cus-1", "Ayşe Yılmaz"), customer("cus-2", "Mehmet Kaya")],
    appointments: [],
    campaigns: [],
    reminderSettings: { enabled: true, channel: "whatsapp", hoursBefore: 24, template: "" },
    reminderLogs: [],
    subscription: { planId: "profesyonel", startedAt: "2026-01-01", nextRenewal: "2026-10-01" },
    invoices: [],
    payments: [],
    expenses: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Borç doğuran randevu
// ---------------------------------------------------------------------------

test("sadece tamamlanan randevu borç doğurur", () => {
  assert.equal(isBillable(apt("a1", "cus-1", TODAY, 500)), true);
  assert.equal(isBillable(apt("a2", "cus-1", TODAY, 500, { status: "bekliyor" })), false);
  assert.equal(isBillable(apt("a3", "cus-1", TODAY, 500, { status: "iptal" })), false);
  // reddedilen online talep hiç olmamış sayılır
  assert.equal(isBillable(apt("a4", "cus-1", TODAY, 500, { approval: "reddedildi" })), false);
});

// ---------------------------------------------------------------------------
// Cari bakiye
// ---------------------------------------------------------------------------

test("cari bakiye = hak edilen − tahsil edilen", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500), apt("a2", "cus-1", "2026-08-15", 300)],
    payments: [payment("p1", "cus-1", "2026-08-01", 500)],
  });
  assert.equal(customerBalance(state, "cus-1"), 300);
});

test("tamamı ödenmiş müşterinin bakiyesi sıfırdır", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500)],
    payments: [payment("p1", "cus-1", "2026-08-01", 500)],
  });
  assert.equal(customerBalance(state, "cus-1"), 0);
});

test("fazla ödeme negatif bakiye (avans) üretir", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500)],
    payments: [payment("p1", "cus-1", "2026-08-01", 800)],
  });
  assert.equal(customerBalance(state, "cus-1"), -300);
});

test("iptal ve bekleyen randevular borç yaratmaz", () => {
  const state = makeState({
    appointments: [
      apt("a1", "cus-1", "2026-08-01", 500, { status: "iptal" }),
      apt("a2", "cus-1", "2026-09-10", 500, { status: "bekliyor" }),
    ],
  });
  assert.equal(customerBalance(state, "cus-1"), 0);
});

test("borçlular listesi sadece bakiyesi pozitif olanları büyükten küçüğe verir", () => {
  const state = makeState({
    appointments: [
      apt("a1", "cus-1", "2026-08-01", 500),
      apt("a2", "cus-2", "2026-08-01", 900),
    ],
    payments: [payment("p1", "cus-1", "2026-08-02", 100)],
  });
  const debtors = customerBalances(state, { onlyDebtors: true, today: TODAY });
  assert.deepEqual(
    debtors.map((d) => [d.customer.id, d.balance]),
    [
      ["cus-2", 900],
      ["cus-1", 400],
    ]
  );
});

test("toplam açık alacak avans veren müşteriyle azalmaz", () => {
  // cus-2 fazla ödemiş; onun eksi bakiyesi cus-1'in borcunu maskelememeli.
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500), apt("a2", "cus-2", "2026-08-01", 100)],
    payments: [payment("p1", "cus-2", "2026-08-01", 600)],
  });
  assert.equal(totalReceivable(state), 500);
});

// ---------------------------------------------------------------------------
// FIFO yaşlandırma
// ---------------------------------------------------------------------------

test("tahsilat EN ESKİ borçtan düşülür (FIFO)", () => {
  // 100 gün önce 500, 5 gün önce 500; 500 ödendi → kalan borç YENİ olandır.
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-05-26", 500), apt("a2", "cus-1", "2026-08-29", 500)],
    payments: [payment("p1", "cus-1", "2026-08-29", 500)],
  });
  const debts = openDebts(state, "cus-1", TODAY);
  assert.equal(debts.length, 1);
  assert.equal(debts[0]!.appointmentId, "a2");
  assert.equal(debts[0]!.amount, 500);
  assert.equal(debts[0]!.bucket, "0-30");
});

test("kısmi ödeme en eski borcu kısmen açık bırakır", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500), apt("a2", "cus-1", "2026-08-20", 300)],
    payments: [payment("p1", "cus-1", "2026-08-21", 200)],
  });
  const debts = openDebts(state, "cus-1", TODAY);
  assert.deepEqual(
    debts.map((d) => [d.appointmentId, d.amount]),
    [
      ["a1", 300],
      ["a2", 300],
    ]
  );
});

test("yaşlandırma kovaları gün yaşına göre doğru dağıtır", () => {
  const state = makeState({
    appointments: [
      apt("a1", "cus-1", "2026-08-25", 100), // 9 gün → 0-30
      apt("a2", "cus-1", "2026-07-20", 200), // 45 gün → 31-60
      apt("a3", "cus-2", "2026-06-20", 300), // 75 gün → 61-90
      apt("a4", "cus-2", "2026-01-10", 400), // 236 gün → 90+
    ],
  });
  assert.deepEqual(agingSummary(state, TODAY), {
    "0-30": 100,
    "31-60": 200,
    "61-90": 300,
    "90+": 400,
  });
});

test("kova sınırları: 30 gün 0-30'da, 31 gün 31-60'ta", () => {
  const state = makeState({
    appointments: [
      apt("a1", "cus-1", "2026-08-04", 100), // tam 30 gün
      apt("a2", "cus-2", "2026-08-03", 200), // tam 31 gün
    ],
  });
  const s = agingSummary(state, TODAY);
  assert.equal(s["0-30"], 100);
  assert.equal(s["31-60"], 200);
});

test("daysBetween gün farkını doğru sayar", () => {
  assert.equal(daysBetween("2026-09-01", "2026-09-03"), 2);
  assert.equal(daysBetween("2026-09-03", "2026-09-03"), 0);
  // gelecekteki tarih negatif değil sıfır döner
  assert.equal(daysBetween("2026-09-10", "2026-09-03"), 0);
});

// ---------------------------------------------------------------------------
// Cari ekstre
// ---------------------------------------------------------------------------

test("ekstre kronolojik ve yürüyen bakiye tutarlı", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500), apt("a2", "cus-1", "2026-08-10", 300)],
    payments: [payment("p1", "cus-1", "2026-08-05", 200)],
  });
  const ledger = customerLedger(state, "cus-1");
  assert.deepEqual(
    ledger.map((e) => [e.kind, e.amount, e.running]),
    [
      ["borc", 500, 500],
      ["tahsilat", -200, 300],
      ["borc", 300, 600],
    ]
  );
  // Ekstrenin son bakiyesi cari bakiyeyle aynı olmalı
  assert.equal(ledger.at(-1)!.running, customerBalance(state, "cus-1"));
});

test("aynı gün borç önce, tahsilat sonra sıralanır", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500)],
    payments: [payment("p1", "cus-1", "2026-08-01", 500)],
  });
  const ledger = customerLedger(state, "cus-1");
  assert.deepEqual(ledger.map((e) => e.kind), ["borc", "tahsilat"]);
  assert.equal(ledger.at(-1)!.running, 0);
});

// ---------------------------------------------------------------------------
// Kasa özeti — ciro / tahsilat ayrımı
// ---------------------------------------------------------------------------

test("ciro ve tahsilat AYRI hesaplanır", () => {
  // Dönemde 800 hizmet verildi ama sadece 300 tahsil edildi.
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-09-01", 500), apt("a2", "cus-2", "2026-09-02", 300)],
    payments: [payment("p1", "cus-1", "2026-09-01", 300)],
    expenses: [expense("e1", "2026-09-02", 100)],
  });
  const s = cashSummary(state, "2026-09-01", TODAY);
  assert.equal(s.earned, 800);
  assert.equal(s.collected, 300);
  assert.equal(s.expenses, 100);
  assert.equal(s.net, 200); // net = tahsilat − gider (ciro DEĞİL)
});

test("dönem dışı kayıtlar özete girmez", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-07-01", 500)],
    payments: [payment("p1", "cus-1", "2026-07-01", 500)],
    expenses: [expense("e1", "2026-07-01", 100)],
  });
  const s = cashSummary(state, "2026-09-01", TODAY);
  assert.equal(s.earned, 0);
  assert.equal(s.collected, 0);
  assert.equal(s.expenses, 0);
  assert.equal(s.net, 0);
});

test("tahsilat yöntemi ve gider kategorisi kırılımı toplamı tutar", () => {
  const state = makeState({
    payments: [
      payment("p1", "cus-1", "2026-09-01", 100, { method: "nakit" }),
      payment("p2", "cus-1", "2026-09-02", 250, { method: "kart" }),
      payment("p3", "cus-2", "2026-09-02", 50, { method: "havale" }),
    ],
    expenses: [expense("e1", "2026-09-01", 300, "kira"), expense("e2", "2026-09-02", 40, "fatura")],
  });
  const s = cashSummary(state, "2026-09-01", TODAY);
  assert.deepEqual(s.byMethod, { nakit: 100, kart: 250, havale: 50 });
  assert.equal(s.byMethod.nakit + s.byMethod.kart + s.byMethod.havale, s.collected);
  assert.equal(s.byCategory.kira, 300);
  assert.equal(s.byCategory.fatura, 40);
  assert.equal(s.net, 400 - 340);
});

test("müşterisiz (genel) tahsilat kasaya girer ama cariye yazılmaz", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-09-01", 500)],
    payments: [{ ...payment("p1", "cus-1", "2026-09-01", 500), customerId: undefined }],
  });
  assert.equal(cashSummary(state, "2026-09-01", TODAY).collected, 500);
  assert.equal(customerBalance(state, "cus-1"), 500); // borç kapanmadı
});

// ---------------------------------------------------------------------------
// Borç hatırlatma mesajı
// ---------------------------------------------------------------------------

test("borcu olmayan müşteriye hatırlatma metni üretilmez", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500)],
    payments: [payment("p1", "cus-1", "2026-08-01", 500)],
  });
  assert.equal(debtReminderText(state, "cus-1", TODAY), null);
});

test("hatırlatma metni gerçek bakiyeyi ve en eski borcun tarihini içerir", () => {
  const state = makeState({
    appointments: [apt("a1", "cus-1", "2026-08-01", 500)],
  });
  const text = debtReminderText(state, "cus-1", TODAY);
  assert.ok(text);
  assert.ok(text!.includes("Ayşe Yılmaz"));
  assert.ok(text!.includes("Test Kuaför"));
  assert.ok(text!.includes("01.08.2026"));
  assert.ok(/500/.test(text!));
});

test("olmayan müşteri için hatırlatma metni null", () => {
  assert.equal(debtReminderText(makeState(), "yok", TODAY), null);
});
