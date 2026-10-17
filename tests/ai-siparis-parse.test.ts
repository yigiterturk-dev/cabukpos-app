// AI sipariş çözümleyici testleri (demo motoru). Doğal Türkçe → ürün satırları.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrder, type OrderProduct } from "@/app/demo/ai-siparis/parser";

const MENU: OrderProduct[] = [
  { id: "p1", name: "Adana Kebap", price: 32000, kind: "adet" },
  { id: "p2", name: "Mercimek Çorba", price: 8500, kind: "adet" },
  { id: "p3", name: "Karışık Pide", price: 26000, kind: "adet" },
  { id: "p4", name: "Künefe", price: 14000, kind: "adet" },
  { id: "p5", name: "Ayran", price: 2500, kind: "adet" },
  { id: "p7", name: "Baklava", price: 48000, kind: "tartili" },
  { id: "p8", name: "Çoban Salata", price: 11000, kind: "adet" },
  { id: "p9", name: "Kola", price: 4000, kind: "adet" },
  { id: "p10", name: "Su", price: 1500, kind: "adet" },
];
const q = (t: string) => Object.fromEntries(parseOrder(t, MENU).lines.map((l) => [l.name, l.qtyMilli]));
const total = (t: string) => parseOrder(t, MENU).total;

test("rakam + kelime miktar, ve ile ayrım", () => {
  const r = parseOrder("2 adana bir ayran, bi de künefe", MENU);
  assert.equal(r.lines.length, 3);
  assert.equal(q("2 adana bir ayran, bi de künefe")["Adana Kebap"], 2000);
  assert.equal(q("2 adana bir ayran, bi de künefe")["Ayran"], 1000);
  assert.equal(total("2 adana bir ayran, bi de künefe"), 80500);
});

test("ve'siz çoklu kalem ayırt edilir", () => {
  const m = q("bir pide iki kola üç su");
  assert.equal(m["Karışık Pide"], 1000);
  assert.equal(m["Kola"], 2000);
  assert.equal(m["Su"], 3000);
  assert.equal(total("bir pide iki kola üç su"), 38500);
});

test("tartılı ürün kg olarak işlenir", () => {
  const r = parseOrder("yarım kilo baklava", MENU);
  assert.equal(r.lines[0].productId, "p7");
  assert.equal(r.lines[0].kind, "tartili");
  assert.equal(r.lines[0].qtyMilli, 500);
  assert.equal(r.total, 24000);
});

test("çok kelimeli ürün adı tek satır sayılır", () => {
  const m = q("iki mercimek çorba ve çoban salata");
  assert.equal(m["Mercimek Çorba"], 2000);
  assert.equal(m["Çoban Salata"], 1000);
  assert.equal(total("iki mercimek çorba ve çoban salata"), 28000);
});

test("aksansız ürün adları demo menüsüyle eşleşir", () => {
  const r = parseOrder("bir kunefe ve iki coban salata", MENU);
  assert.equal(r.lines.length, 2);
  assert.equal(q("bir kunefe ve iki coban salata")["Künefe"], 1000);
  assert.equal(q("bir kunefe ve iki coban salata")["Çoban Salata"], 2000);
  assert.deepEqual(r.unmatched, []);
});

test("bir buçuk miktarı aksan normalizasyonunda korunur", () => {
  const r = parseOrder("bir buçuk kilo baklava", MENU);
  assert.equal(r.lines[0].qtyMilli, 1500);
  assert.equal(r.total, 72000);
});

test("şu su ifadesi aksan normalizasyonunda iki ürün sayılmaz", () => {
  const r = parseOrder("şu su", MENU);
  assert.equal(q("şu su")["Su"], 1000);
  assert.deepEqual(r.unmatched, []);
});

test("anlaşılmayan kelimeler raporlanır", () => {
  const r = parseOrder("iki bilinmeyen şey", MENU);
  assert.equal(r.lines.length, 0);
  assert.ok(r.unmatched.length > 0);
});
