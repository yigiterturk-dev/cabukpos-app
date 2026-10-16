// tests/cart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENCIES, formatTL, isCurrency, formatMoney, parseTL, parseMoney, splitVat } from "@/lib/core/money";
import { addProduct, discountedVat, lineTotal, removedLines, setQty, totals, type VatLine } from "@/lib/core/cart";

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
  // #16: sonekli/öneki para birimi etiketli biçimler de çözülür
  assert.equal(parseMoney("12,50 ₺"), 1250);
  assert.equal(parseMoney("12,50 USD"), 1250);
  assert.equal(parseMoney("₺12,50"), 1250);
  assert.equal(parseMoney("1.234,56 TL"), 123456);
  assert.equal(parseMoney("12,50 GBP"), 1250);
  assert.equal(parseMoney("12,50 XYP"), null); // bilinmeyen etiket → çöp
  assert.equal(formatTL(123456), "1.234,56 ₺");
  assert.equal(formatTL(-500), "-5,00 ₺");
  assert.equal(parseTL("$ 25"), 2500);
  assert.equal(parseTL("12,99 €"), 1299);
});

test("çoklu para birimi (#16): meta, tip koruması, biçim", () => {
  assert.deepEqual(Object.keys(CURRENCIES), ["TRY", "USD", "EUR", "GBP"]);
  assert.equal(isCurrency("EUR"), true);
  assert.equal(isCurrency("BTC"), false);
  assert.equal(formatMoney(123456, "USD"), "$1.234,56");
  assert.equal(formatMoney(999, "EUR"), "€9,99");
  assert.equal(formatMoney(500, "TRY"), formatMoney(500)); // varsayılan TRY
  assert.equal(typeof formatMoney(1, "GBP"), "string");
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

test("#33: discountedVat — indirim oransal yansır, kırılım toplamı korunur", () => {
  const vat: VatLine[] = [
    { rate: 10, gross: 38500, net: 35000, vat: 3500 },
    { rate: 20, gross: 1000, net: 833, vat: 167 },
  ];
  const d = discountedVat(vat, 5000);
  assert.equal(d.reduce((s, v) => s + v.gross, 0), 34500); // brüt − indirim korunur
  assert.equal(d[0].gross, 33627); // oransal pay yuvarlanır (5000×38500/39500 = 4873)
  assert.equal(d[1].gross, 873); // son oran kalan kuruşu alır
  assert.equal(d[1].net + d[1].vat, d[1].gross); // net + KDV = brüt
  assert.deepEqual(discountedVat(vat, 0), vat); // indirimsiz kimlik
  assert.deepEqual(discountedVat(vat, 999999), discountedVat(vat, 39500)); // kırılım toplamını aşamaz
  assert.deepEqual(discountedVat([], 1000), []);
});
