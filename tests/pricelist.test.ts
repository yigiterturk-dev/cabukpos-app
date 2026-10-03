// #50 fiyat listesi / happy hour — saf modül testleri.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePrice, listActiveAt, type PriceListCore } from "../lib/core/pricelist";

const at = (day: number, h: number, m = 0) => {
  // 2026-10-04 pazar (getDay 0); gün sabitleyici: 4 + day (0=paz … 6=cmt)
  return new Date(2026, 9, 4 + day, h, m);
};

const list = (over: Partial<PriceListCore>): PriceListCore => ({
  id: "l1", days: [], startMin: 17 * 60, endMin: 19 * 60, storeId: null,
  items: [{ productId: "p1", price: 5000 }],
  ...over,
});

test("pencere içinde: liste fiyatı, dışında: taban", () => {
  const l = [list({})];
  assert.equal(effectivePrice("p1", 9000, l, at(1, 18)), 5000);
  assert.equal(effectivePrice("p1", 9000, l, at(1, 16, 59)), 9000);
  assert.equal(effectivePrice("p1", 9000, l, at(1, 19)), 9000); // bitiş hariç
});

test("gün filtresi: yalnız işaretli günler", () => {
  const l = [list({ days: [1, 2] })]; // pzt + sal
  assert.equal(effectivePrice("p1", 9000, l, at(1, 18)), 5000); // pzt
  assert.equal(effectivePrice("p1", 9000, l, at(3, 18)), 9000); // çar
});

test("gece yarısı aşımı: 22:00–02:00", () => {
  const l = [list({ startMin: 22 * 60, endMin: 2 * 60 })];
  assert.equal(effectivePrice("p1", 9000, l, at(1, 23)), 5000);
  assert.equal(effectivePrice("p1", 9000, l, at(2, 1)), 5000); // ertesi gün, pencere içinde
  assert.equal(effectivePrice("p1", 9000, l, at(2, 2)), 9000);
  assert.equal(effectivePrice("p1", 9000, l, at(2, 21, 59)), 9000);
});

test("şube kapsamı: null herkese, eşleşmeyen şube pas", () => {
  const l = [list({ storeId: "s1" })];
  assert.equal(effectivePrice("p1", 9000, l, at(1, 18), "s1"), 5000);
  assert.equal(effectivePrice("p1", 9000, l, at(1, 18), "s2"), 9000);
  assert.equal(effectivePrice("p1", 9000, [list({ storeId: null })], at(1, 18), "s2"), 5000);
});

test("ilk eşleşen kazanır (sort sırası dizideki sıra)", () => {
  const l = [list({ id: "once", items: [{ productId: "p1", price: 4000 }] }), list({ id: "sonra", items: [{ productId: "p1", price: 3000 }] })];
  assert.equal(effectivePrice("p1", 9000, l, at(1, 18)), 4000);
});

test("listede olmayan ürün taban kalır; listedeki diğer ürün etkilenmez", () => {
  const l = [list({ items: [{ productId: "p1", price: 5000 }] })];
  assert.equal(effectivePrice("p2", 9000, l, at(1, 18)), 9000);
});

test("start == end: hiçbir zaman aktif değil", () => {
  assert.equal(listActiveAt(list({ startMin: 600, endMin: 600 }), at(1, 10)), false);
});

test("tartılı kg fiyatı da ezilir (aynı yol)", () => {
  const l = [list({ items: [{ productId: "kilo", price: 12000 }] })];
  assert.equal(effectivePrice("kilo", 18000, l, at(1, 18)), 12000);
});
