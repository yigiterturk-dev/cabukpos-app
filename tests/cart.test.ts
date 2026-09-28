// tests/cart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTL, parseTL, splitVat } from "@/lib/core/money";
import { addProduct, lineTotal, removedLines, setQty, totals } from "@/lib/core/cart";

const doner = { id: "d", name: "Döner", price: 18000, vatRate: 10 as const };
const ayran = { id: "a", name: "Ayran", price: 2500, vatRate: 10 as const };
const su = { id: "s", name: "Su", price: 1000, vatRate: 20 as const };

test("TL ayrıştırma ve biçim", () => {
  assert.equal(parseTL("12,50"), 1250);
  assert.equal(parseTL("12.5"), 1250);
  assert.equal(parseTL("1.234,56"), 123456);
  assert.equal(parseTL(" 7 ₺"), 700);
  assert.equal(parseTL("0,005"), null);
  assert.equal(parseTL("-3"), null);
  assert.equal(parseTL("abc"), null);
  assert.equal(formatTL(123456), "1.234,56 ₺");
  assert.equal(formatTL(-500), "-5,00 ₺");
});

test("KDV ayırma (dahil fiyattan)", () => {
  assert.deepEqual(splitVat(38500, 10), { net: 35000, vat: 3500 });
  assert.deepEqual(splitVat(1000, 20), { net: 833, vat: 167 });
  assert.deepEqual(splitVat(1, 1), { net: 1, vat: 0 });
});

test("sepet: ekle birleştirir, miktar 0 siler, toplam ve oran bazında KDV", () => {
  let c = addProduct([], doner);
  c = addProduct(c, ayran);
  c = addProduct(c, doner);
  assert.equal(c.length, 2);
  assert.equal(c[0].qtyMilli, 2000);
  assert.equal(lineTotal(c[0]), 36000);
  c = addProduct(c, su);
  const t = totals(c);
  assert.equal(t.total, 39500);
  assert.equal(t.count, 4);
  assert.deepEqual(t.vat, [
    { rate: 10, gross: 38500, net: 35000, vat: 3500 },
    { rate: 20, gross: 1000, net: 833, vat: 167 },
  ]);
  c = setQty(c, "s", 0);
  assert.equal(c.length, 2);
  assert.equal(lineTotal({ ...c[1], qtyMilli: 1500 }), 3750); // M3 tartılı için kesirli miktar
});

test("M9a: removedLines — silme, azaltma, artış yok sayılır, boşaltma", () => {
  const c = addProduct(addProduct([], doner, 3000), ayran);
  assert.deepEqual(removedLines(c, setQty(c, "d", 1000)), [{ productId: "d", name: "Döner", qtyMilli: 2000, total: 36000 }]);
  assert.deepEqual(removedLines(c, setQty(c, "a", 0)), [{ productId: "a", name: "Ayran", qtyMilli: 1000, total: 2500 }]);
  assert.deepEqual(removedLines(c, addProduct(c, su)), []);
  assert.deepEqual(removedLines(c, setQty(c, "d", 4000)), []);
  assert.equal(removedLines(c, []).reduce((s, l) => s + l.total, 0), 56500);
});
