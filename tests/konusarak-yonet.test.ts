// "Konuşarak yönet" motoru testleri (demo). Doğal Türkçe soru → rapor/stok cevabı.
import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "@/app/demo/konusarak-yonet/engine";

test("ciro sorusu tutar döner", () => {
  const a = query("bugün ciro ne");
  assert.match(a.answer, /cirosu/);
  assert.match(a.answer, /₺/);
  assert.equal(a.period, "bugün");
});

test("en çok satan: 5 satır, ilk ürün Su (dün)", () => {
  const a = query("dün en çok ne sattım");
  assert.equal(a.rows?.length, 5);
  assert.match(a.rows![0].label, /Su/);
});

test("kritik stok listesi", () => {
  const a = query("kritik stok var mı");
  assert.match(a.answer, /3 ürün/);
  assert.equal(a.rows?.length, 3);
});

test("belirli ürün stoğu", () => {
  const a = query("süt bitti mi");
  assert.match(a.answer, /Süt/);
  assert.match(a.answer, /3 adet/);
});

test("fiş sayısı", () => {
  assert.match(query("kaç fiş kestim").answer, /42/);
});

test("ortalama sepet", () => {
  assert.match(query("ortalama sepet ne kadar").answer, /ortalama sepet/);
});

test("öngörülü sipariş önerisi", () => {
  const a = query("bu hafta ne bitecek, ne sipariş vereyim");
  assert.ok((a.rows?.length ?? 0) > 0);
  assert.match(a.answer, /sipariş/);
  assert.match(a.rows![0].label, /Süt/);
});

test("tüm stok listesi", () => {
  const a = query("tüm stok durumu ne");
  assert.equal(a.rows?.length, 6);
});

test("en iyi gün", () => {
  const a = query("hangi gün en yoğundu");
  assert.match(a.answer, /en iyi günü/);
});

test("anlaşılmayan soru yardım döner", () => {
  assert.match(query("merhaba nasılsın").answer, /Anlayamadım/);
});
