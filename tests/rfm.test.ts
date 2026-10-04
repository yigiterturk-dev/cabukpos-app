// tests/rfm.test.ts — #40 saf çekirdek: RFM puan/segment, kohort gridi, CSV.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rfmScore, rfmSegment, RFM_SEGMENT, cohortGrid, rfmCsv, rfmMonths } from "@/lib/core/rfm";

const NOW = Date.UTC(2026, 9, 4, 12); // 2026-10-04

test("rfmScore: recency/frequency/monetary eşikleri", () => {
  assert.deepEqual(rfmScore(NOW, new Date(NOW - 3 * 86_400_000).toISOString(), 25, 3_000_000), { r: 5, f: 5, m: 5 });
  assert.deepEqual(rfmScore(NOW, new Date(NOW - 45 * 86_400_000).toISOString(), 3, 300_000), { r: 3, f: 2, m: 2 });
  assert.deepEqual(rfmScore(NOW, new Date(NOW - 200 * 86_400_000).toISOString(), 1, 50_000), { r: 1, f: 1, m: 1 });
});

test("rfmSegment: klasik eşleme", () => {
  assert.equal(RFM_SEGMENT[rfmSegment({ r: 5, f: 5, m: 5 })], "Şampiyon");
  assert.equal(RFM_SEGMENT[rfmSegment({ r: 4, f: 1, m: 2 })], "Yeni");
  assert.equal(RFM_SEGMENT[rfmSegment({ r: 1, f: 5, m: 4 })], "Risk altında");
  assert.equal(RFM_SEGMENT[rfmSegment({ r: 1, f: 1, m: 1 })], "Kayıp");
});

test("rfmMonths: 12 ay artan, İstanbul", () => {
  const m = rfmMonths(NOW);
  assert.equal(m.length, 12);
  assert.equal(m[11], "2026-10");
  assert.ok(m[0] < m[11]);
});

test("cohortGrid: ilk ay 100%, tekrar sipariş sayımı", () => {
  const months = ["2026-08", "2026-09", "2026-10"];
  const orders = [
    { customerId: "a", at: "2026-08-05T10:00:00Z" },
    { customerId: "a", at: "2026-09-10T10:00:00Z" }, // a: 8. ay kohortu, +1 ayda tekrar
    { customerId: "b", at: "2026-08-20T10:00:00Z" },
    { customerId: "c", at: "2026-09-02T10:00:00Z" },
  ];
  const rows = cohortGrid(orders, months);
  const aug = rows.find((r) => r.month === "2026-08")!;
  assert.equal(aug.size, 2);
  assert.equal(aug.cells[0].ordered, 2); // ilk ay
  assert.equal(aug.cells[1].ordered, 1); // yalnız a
  const sep = rows.find((r) => r.month === "2026-09")!;
  assert.equal(sep.size, 1);
  assert.equal(sep.cells[0].ordered, 1);
  assert.equal(rows.find((r) => r.month === "2026-10"), undefined); // kohortu olmayan ay satır yok
});

test("rfmCsv: BOM, noktalı virgül, formül koruması", () => {
  const csv = rfmCsv([{ name: "=Zararlı", phone: "0555", orders: 2, spend: 12_500, lastOrderAt: "2026-10-01T09:00:00Z", recencyDays: 3, segment: "Şampiyon" }]);
  assert.ok(csv.startsWith("\uFEFFMüşteri;Telefon"));
  assert.ok(csv.includes("'=Zararlı"));
  assert.ok(csv.includes("125,00"));
});
