// tests/scan.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, ean13Valid, parseKg, parseScaleBarcode, parseScanInput, resolveScan } from "@/lib/core/scan";
import type { KasaProduct } from "@/lib/offline/state";

const sut: KasaProduct = { id: "s", name: "Süt", price: 3500, vatRate: 1, categoryId: null, barcodes: ["8690000000012"], kind: "adet", plu: null, quick: true };
const domates: KasaProduct = { id: "d", name: "Domates", price: 8000, vatRate: 1, categoryId: null, barcodes: ["8690000000029"], kind: "tartili", plu: "12345", quick: false };
const ix = buildIndex([sut, domates]);

test("EAN-13 kontrol hanesi", () => {
  assert.equal(ean13Valid("2712345007504"), true);
  assert.equal(ean13Valid("2712345007505"), false);
  assert.equal(ean13Valid("5901234123457"), true);
  assert.equal(ean13Valid("59012341234"), false);
});

test("terazi etiketi", () => {
  assert.deepEqual(parseScaleBarcode("2712345007504"), { plu: "12345", grams: 750 });
  assert.equal(parseScaleBarcode("2712345007505"), null);
  assert.equal(parseScaleBarcode("8690000000012"), null);
  assert.equal(parseScaleBarcode("2712345000002"), null); // 0 gram
});

test("çarpan ve kg ayrıştırma", () => {
  assert.deepEqual(parseScanInput("3*8690000000012"), { qty: 3, code: "8690000000012" });
  assert.deepEqual(parseScanInput(" 8690000000012 "), { qty: 1, code: "8690000000012" });
  assert.deepEqual(parseScanInput("0*x"), { qty: 0, code: "x" });
  assert.equal(parseKg("0,75"), 750);
  assert.equal(parseKg("1.5"), 1500);
  assert.equal(parseKg("2"), 2000);
  assert.equal(parseKg("0,7505"), null);
  assert.equal(parseKg("0"), null);
  assert.equal(parseKg("abc"), null);
});

test("okutma çözümü", () => {
  assert.deepEqual(resolveScan("3*8690000000012", ix), { product: sut, qtyMilli: 3000 });
  assert.deepEqual(resolveScan("2712345007504", ix), { product: domates, qtyMilli: 750 });
  assert.deepEqual(resolveScan("8690000000029", ix), { weigh: domates });
  assert.ok("error" in resolveScan("2*2712345007504", ix));
  assert.ok("error" in resolveScan("1234", ix));
  assert.ok("error" in resolveScan("0*8690000000012", ix));
  assert.ok("error" in resolveScan("2799999007509", ix)); // bilinmeyen PLU
});
