// tests/accounting.test.ts — #20: yevmiye kuralları + sağlayıcı CSV (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyJournal, csvCell, toProviderCsv, type MonthInput } from "@/lib/core/accounting";

const base: MonthInput = {
  year: 2026, month: 9,
  posDays: [{ date: "2026-09-02", gross: 11000, net: 10000, vat: 1000 }],
  earsiv: [{ date: "2026-09-03", no: "CBP2026-1", buyer: "Anadolu A.Ş.", gross: 22000, net: 20000, vat: 2000 }],
  refunds: [
    { date: "2026-09-04", no: "K1-7", gross: 5500, net: 5000, vat: 500, earsiv: false },
    { date: "2026-09-05", no: "CBP2026-2", gross: 1100, net: 1000, vat: 100, earsiv: true, buyer: "Anadolu A.Ş." },
  ],
  purchases: [{ date: "2026-09-06", docNo: "AL-9", supplier: "Toptancı", total: 9900 }],
};

const sum = (lines: { debit: number; credit: number }[]) => lines.reduce((t, l) => t + l.debit - l.credit, 0);

test("her fiş dengeli: borç = alacak", () => {
  for (const e of buildMonthlyJournal(base)) assert.equal(sum(e.lines), 0, e.no);
});

test("gün sonu POS: 102 borç, 600+391 alacak", () => {
  const e = buildMonthlyJournal(base).find((x) => x.desc.startsWith("Gün sonu"))!;
  assert.deepEqual(e.lines.map((l) => [l.code, l.debit, l.credit]), [
    ["102", 11000, 0], ["600", 0, 10000], ["391", 0, 1000],
  ]);
});

test("e-Arşiv: 120 cari borç; iade ters kayıt; e-Arşiv iadesi 120 üzerinden", () => {
  const es = buildMonthlyJournal(base).find((x) => x.desc.includes("CBP2026-1"))!;
  assert.equal(es.lines[0]?.code, "120");
  const ri = buildMonthlyJournal(base).find((x) => x.desc.includes("İade K1-7"))!;
  assert.deepEqual(ri.lines.map((l) => [l.code, l.debit, l.credit]), [["600", 5000, 0], ["391", 500, 0], ["102", 0, 5500]]);  const re = buildMonthlyJournal(base).find((x) => x.desc.includes("CBP2026-2"))!;
  assert.equal(re.lines.at(-1)?.code, "120");
});

test("alım: 153 borç, 320 alacak; sıra güne göre", () => {
  const entries = buildMonthlyJournal(base);
  const p = entries.find((x) => x.desc.includes("AL-9"))!;
  assert.deepEqual(p.lines.map((l) => [l.code, l.debit, l.credit]), [["153", 9900, 0], ["320", 0, 9900]]);
  const dates = entries.map((e) => e.date);
  assert.deepEqual(dates, [...dates].sort());
});

test("boş ay fiş üretmez", () => {
  assert.deepEqual(buildMonthlyJournal({ ...base, posDays: [], earsiv: [], refunds: [], purchases: [] }), []);
});

test("CSV: ayraç noktalı virgül, para virgüllü, hücre kaçışı + formül koruması", () => {
  const csv = toProviderCsv(buildMonthlyJournal(base), "parasut");
  const lines = csv.split("\r\n");
  assert.match(lines[0]!, /Fiş Tarihi;Fiş No;Fiş Açıklaması;Hesap Kodu/);
  assert.match(lines[1]!, /02\/09\/2026;0001;.*;102;Bankalar;110,00;0,00/);
  const evil = buildMonthlyJournal({ ...base, earsiv: [{ date: "2026-09-03", no: "X=1+2", buyer: 'A"ş;B', gross: 100, net: 90, vat: 10 }] });
  const evilCsv = toProviderCsv(evil, "logo");
  assert.match(evilCsv, /"X=1\+2 A""ş;B"/);
  assert.equal(csvCell("=KÖTÜ", ";"), "'=KÖTÜ");
});
