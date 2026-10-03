// tests/i18n.test.ts — #45 i18n saf katmanı: dil doğrulama, çeviri, düşme, yer tutucu.
import { test } from "node:test";
import assert from "node:assert/strict";
const { t, tf, isLang, LANGS, LANG_COOKIE, dict } = await import("@/lib/core/i18n");

test("isLang: yalnız tr/en; çerez adı", () => {
  assert.deepEqual([...LANGS], ["tr", "en"]);
  assert.equal(isLang("en"), true);
  assert.equal(isLang("de"), false);
  assert.equal(isLang(undefined), false);
  assert.equal(isLang(""), false);
  assert.match(LANG_COOKIE, /^cz_/);
});

test("t: tr ve en; eksik anahtar anahtarı döner", () => {
  assert.equal(t("tr", "kaydet"), "Kaydet");
  assert.equal(t("en", "kaydet"), "Save");
  assert.equal(t("en", "raporlar"), "Reports");
  // TSDictKey dışı çağrı yok — anahtar bilinmiyorsa derlenmez; çalışma anında güvenlik:
  assert.equal(t("tr", "yok-boyle" as never), "yok-boyle");
});

test("tf: kısayol + yer tutucu değişimi", () => {
  const tt = tf("en");
  assert.equal(tt("kaydet"), "Save");
  assert.equal(tf("tr")("toplam"), "Toplam");
  assert.equal(t("tr", "kritikStok", { n: 3 }), "Kritik stok (3)");
  assert.equal(t("en", "kritikStok", { n: 3 }), "Critical stock (3)");
});

test("sözlükte her girdinin iki dili de dolu", () => {
  for (const [k, e] of Object.entries(dict)) {
    assert.ok(e.tr.trim(), `dict.${k}.tr boş`);
    assert.ok(e.en.trim(), `dict.${k}.en boş`);
  }
});
