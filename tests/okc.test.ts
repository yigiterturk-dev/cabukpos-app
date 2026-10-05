// tests/okc.test.ts — #18 ÖKC saf katmanı: fiş no biçimi, fiş bloğu, Z no.
import { test } from "node:test";
import assert from "node:assert/strict";
const { okcFiscalNo, okcNotes, zNoOf, OKC_PROVIDERS } = await import("@/lib/core/okc");
const { getOkc } = await import("@/lib/fiscal/okc");

test("okcFiscalNo: seri-Z-sıra biçimi ve sıfır dolgu", () => {
  assert.equal(okcFiscalNo("TRA123", 7, 42), "TRA123-0007-000042");
  assert.equal(okcFiscalNo("abc-1", 0, 1), "abc-1-0000-000001");
});

test("okcFiscalNo: geçersiz girdi reddedilir", () => {
  assert.throws(() => okcFiscalNo("ab", 1, 1)); // seri kısa
  assert.throws(() => okcFiscalNo("SERİ İ", 1, 1)); // boşluk/kırık karakter
  assert.throws(() => okcFiscalNo("ABC", -1, 1)); // negatif Z
  assert.throws(() => okcFiscalNo("ABC", 1, 0)); // sıra 0 olmaz
  assert.throws(() => okcFiscalNo("ABC", 1, 1_000_000)); // sıra tavan
});

test("okcNotes: künye satırları + TEST notu", () => {
  const n = okcNotes({ no: "TRA123-0007-000042", zNo: 7, serial: "TRA123" });
  assert.equal(n.title, "MALİ FİŞ");
  assert.deepEqual(n.rows, [["Fiş No", "TRA123-0007-000042"], ["Z No", "7"], ["Cihaz", "TRA123"]]);
  assert.deepEqual(n.notes, []);
  assert.deepEqual(okcNotes({ no: "X", zNo: 1, serial: "X", test: true }).notes, ["TEST — mali değeri yoktur"]);
});

test("zNoOf: satış gününden durumsuz, 4 haneye sarmalanır", () => {
  const d = new Date("2026-10-03T12:00:00Z");
  assert.equal(zNoOf(d), Math.floor(d.getTime() / 86_400_000) % 10_000);
  assert.ok(zNoOf(d) >= 0 && zNoOf(d) < 10_000);
});

test("sağlayıcı listesi sandbox'ı içerir", () => {
  assert.ok(OKC_PROVIDERS.some((p) => p.value === "fake-okc"));
});

test("sahte ÖKC production'da fail-closed olur", () => {
  const env = process.env as Record<string, string | undefined>;
  const old = env.NODE_ENV;
  env.NODE_ENV = "production";
  assert.throws(() => getOkc("fake-okc", { fakeFail: false }), /production'da kullanılamaz/);
  if (old === undefined) delete env.NODE_ENV; else env.NODE_ENV = old;
});
