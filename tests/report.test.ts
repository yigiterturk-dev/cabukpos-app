// tests/report.test.ts — saf rapor hesabı (DB yok).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidCalendarDay, parseRange, prevRange, rangeBounds, dayCount, dateRanges, summarize, pctChange, byChannel, byMethod, heatmap,
  productRows, categoryRows, staffRows, tabEventRow, registerEventRow, toCsv, csvTL, csvQty, type SaleRow,
} from "@/lib/core/report";

const NOW = Date.parse("2026-09-29T10:00:00Z"); // İstanbul 13:00, Salı
const sale = (o: Partial<SaleRow>): SaleRow => ({ id: crypto.randomUUID(), status: "kapandi", channel: "kasa", total: 10000, net: 9091, change: 0, at: new Date(NOW), staffId: "s1", ...o });

test("takvim günü: gerçek tarihleri kabul et, rollover olan günleri reddet", () => {
  assert.equal(isValidCalendarDay("2024-02-29"), true);
  assert.equal(isValidCalendarDay("2026-02-30"), false);
  assert.equal(isValidCalendarDay("2025-02-29"), false);
  assert.equal(isValidCalendarDay("2026-13-01"), false);
});

test("dönem: varsayılan 7 gün, ters sıra düzelir, tavan 366, önceki dönem, İstanbul sınırı", () => {
  assert.deepEqual(parseRange(undefined, undefined, NOW), { bas: "2026-09-23", bit: "2026-09-29" });
  assert.deepEqual(parseRange("2026-09-29", "2026-09-01", NOW), { bas: "2026-09-01", bit: "2026-09-29" });
  assert.deepEqual(parseRange("x", "2026-09-01", NOW), { bas: "2026-09-23", bit: "2026-09-29" });
  assert.equal(dayCount(parseRange("2020-01-01", "2026-09-29", NOW)), 366);
  assert.deepEqual(prevRange({ bas: "2026-09-23", bit: "2026-09-29" }), { bas: "2026-09-16", bit: "2026-09-22" });
  const b = rangeBounds({ bas: "2026-09-29", bit: "2026-09-29" });
  assert.equal(b.from.toISOString(), "2026-09-28T21:00:00.000Z");
  assert.equal(b.to.toISOString(), "2026-09-29T21:00:00.000Z");
  const p = dateRanges(NOW);
  assert.deepEqual(p.find((x) => x.key === "ay"), { key: "ay", label: "Bu ay", bas: "2026-09-01", bit: "2026-09-29" });
  assert.deepEqual(p.find((x) => x.key === "dun"), { key: "dun", label: "Dün", bas: "2026-09-28", bit: "2026-09-28" });
});

test("özet: iade düşer, ortalama, değişim", () => {
  const s = summarize([sale({ total: 30000, net: 27273 }), sale({ total: 10000, net: 9091 }), sale({ status: "iade", total: 5000, net: 4545 })]);
  assert.deepEqual(s, { gross: 35000, net: 31819, count: 2, refunds: 1, refundTotal: 5000, avg: 17500 });
  assert.equal(summarize([]).avg, null);
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(5, 0), null);
});

test("kanal ve ödeme dağılımı: para üstü nakitten, iade eksi", () => {
  const a = sale({ id: "a", total: 9000, change: 1000 }), b = sale({ id: "b", channel: "paket", total: 5000 }), r = sale({ id: "r", status: "iade", total: 2000 });
  assert.deepEqual(byChannel([a, b, r]), [{ key: "kasa", label: "Kasa", gross: 7000, count: 1 }, { key: "paket", label: "Paket", gross: 5000, count: 1 }]);
  const m = byMethod([a, b, r], [{ saleId: "a", method: "nakit", amount: 10000 }, { saleId: "b", method: "kart", amount: 5000 }, { saleId: "r", method: "nakit", amount: 2000 }]);
  assert.deepEqual(m, [{ key: "nakit", label: "Nakit", amount: 7000 }, { key: "kart", label: "Kart", amount: 5000 }]);
});

test("yoğunluk: İstanbul günü ve saati (UTC 21:30 Pzt = Salı 00:30)", () => {
  const h = heatmap([sale({ at: new Date("2026-09-28T21:30:00Z"), total: 4000 }), sale({ at: new Date("2026-09-28T21:45:00Z"), total: 1000 })]);
  assert.deepEqual(h.cells[1][0], { gross: 5000, count: 2 });
  assert.equal(h.max, 5000);
  assert.equal(h.cells.length, 7);
  assert.equal(h.cells[0].length, 24);
});

test("ürün ve kategori: iade eksi, pay, sıralama", () => {
  const rows = productRows([
    { productId: "p1", name: "Döner", categoryId: "c1", qtyMilli: 2000, total: 36000, refund: false },
    { productId: "p2", name: "Ayran", categoryId: null, qtyMilli: 5000, total: 12500, refund: false },
    { productId: "p1", name: "Döner", categoryId: "c1", qtyMilli: 1000, total: 18000, refund: true },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.qtyMilli, r.gross]), [["Döner", 1000, 18000], ["Ayran", 5000, 12500]]);
  assert.equal(Math.round(rows[0].share), 59);
  assert.deepEqual(productRows([{ productId: "p1", name: "Döner", categoryId: "c1", qtyMilli: 1000, total: 18000, refund: false }, { productId: "p2", name: "Ayran", categoryId: null, qtyMilli: 5000, total: 12500, refund: false }], "adet").map((r) => r.name), ["Ayran", "Döner"]);
  assert.deepEqual(categoryRows(rows, new Map([["c1", "Ana yemek"]])).map((c) => [c.name, c.gross]), [["Ana yemek", 18000], ["Kategorisiz", 12500]]);
});

test("olay metni + personel birleştirme", () => {
  const at = new Date(NOW);
  const v = tabEventRow({ at, staffId: "s1", approvedBy: "m1", type: "void", payload: { lineId: "l", reason: "yanlış" }, line: { name: "Döner", unitPrice: 18000, qtyMilli: 2000 } });
  assert.deepEqual(v, { at, staffId: "s1", kind: "iptal", text: "Döner × 2", amount: 36000, approvedBy: "m1", reason: "yanlış" });
  const d = tabEventRow({ at, staffId: "s1", approvedBy: null, type: "discount", payload: { percent: 10, amount: null, reason: "" }, line: null });
  assert.equal(d.text, "Adisyon indirimi %10");
  assert.equal(d.reason, null);
  const c = tabEventRow({ at, staffId: "s1", approvedBy: null, type: "comp", payload: { lineId: "x", reason: "müdavim" }, line: { name: "Çay", unitPrice: 1000, qtyMilli: 1000 } });
  const r = registerEventRow({ at, staffId: "s1", type: "cart_cleared", lines: [{ productId: null, name: "Su", qtyMilli: 1000, total: 1000 }, { productId: null, name: "Ayran", qtyMilli: 2000, total: 5000 }], total: 6000 });
  assert.equal(r.text, "Sepet boşaltıldı: Su × 1, Ayran × 2");
  const rows = staffRows(
    [sale({ total: 30000 }), sale({ staffId: "s2", total: 5000 }), sale({ status: "iade", total: 2000 })],
    [{ staffId: "s1", discount: 1500 }],
    [v, d, c, r, { at, staffId: "s1", kind: "iade", text: "İade K1-000001", amount: 2000, approvedBy: "m1", reason: null }, { ...r, staffId: null }],
    new Map([["s1", "Ayşe"]]),
  );
  assert.deepEqual(rows[0], { staffId: "s1", name: "Ayşe", gross: 30000, count: 1, refunds: 1, refundTotal: 2000, voids: 1, voidTotal: 36000, comps: 1, compTotal: 1000, discounts: 1, discountTotal: 1500, cancels: 0, removed: 1, removedTotal: 6000 });
  assert.equal(rows[1].name, "Bilinmeyen");
});

test("CSV: BOM, ; ayırıcı, CRLF, kaçış, formül koruması, negatif tutar korunur", () => {
  const out = toCsv(["Ad", "Tutar"], [["=HYPERLINK(1)", csvTL(-1250)], ['A;"b"', csvTL(123450)], ["x", null], ["y", csvQty(1500)]]);
  assert.equal(out, "﻿Ad;Tutar\r\n'=HYPERLINK(1);-12,50\r\n\"A;\"\"b\"\"\";1234,50\r\nx;\r\ny;1,5\r\n");
});
