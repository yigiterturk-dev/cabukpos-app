// tests/veri-confirm.test.ts — hesap silme onayı saf fonksiyon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isimEslesiyor } from "@/lib/core/veri-confirm";

test("işletme adı eşleşmesi: büyük/küçük harf ve boşluk affedilir", () => {
  assert.equal(isimEslesiyor("Kahve Dünyası", "Kahve Dünyası"), true);
  assert.equal(isimEslesiyor("  kahve   dünyası ", "Kahve Dünyası"), true);
  assert.equal(isimEslesiyor("KAHVE DÜNYASI", "Kahve Dünyası"), true);
});

test("yanlış veya boş ad silme başlatmaz", () => {
  assert.equal(isimEslesiyor("Kahve Dunyasi", "Kahve Dünyası"), false);
  assert.equal(isimEslesiyor("Kahve", "Kahve Dünyası"), false);
  assert.equal(isimEslesiyor("", "Kahve Dünyası"), false);
  assert.equal(isimEslesiyor("Kahve Dünyası", ""), false);
});
