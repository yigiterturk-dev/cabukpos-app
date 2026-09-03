import test from "node:test";
import assert from "node:assert/strict";

import { toE164TR } from "../lib/messaging/phone.ts";
import { renderTemplate } from "../lib/messaging/template.ts";

test("TR telefon biçimleri E.164'e çevrilir", () => {
  const beklenen = "+905321234567";
  assert.equal(toE164TR("0532 123 45 67"), beklenen);
  assert.equal(toE164TR("05321234567"), beklenen);
  assert.equal(toE164TR("532 123 45 67"), beklenen);
  assert.equal(toE164TR("905321234567"), beklenen);
  assert.equal(toE164TR("+90 532 123 45 67"), beklenen);
  assert.equal(toE164TR("(0532) 123-45-67"), beklenen);
});

test("çözümlenemeyen numara null döner — uydurma numaraya mesaj gitmez", () => {
  assert.equal(toE164TR(""), null);
  assert.equal(toE164TR("123"), null);
  assert.equal(toE164TR("abc"), null);
  assert.equal(toE164TR("0212 000"), null);
});

test("şablon yer tutucuları dolar", () => {
  const out = renderTemplate("Merhaba {ad}, {isletme} randevun {saat} ({hizmet}).", {
    ad: "Ayşe",
    saat: "14:30",
    hizmet: "Saç kesimi",
    isletme: "Nova Kuaför",
  });
  assert.equal(out, "Merhaba Ayşe, Nova Kuaför randevun 14:30 (Saç kesimi).");
});

test("aynı yer tutucu birden fazla geçerse hepsi dolar", () => {
  const out = renderTemplate("{ad}, {ad} bekleniyorsun {saat}", {
    ad: "Ali", saat: "09:00", hizmet: "-", isletme: "-",
  });
  assert.equal(out, "Ali, Ali bekleniyorsun 09:00");
});

test("bilinmeyen yer tutucu olduğu gibi kalır", () => {
  const out = renderTemplate("Selam {ad} {bilinmeyen}", {
    ad: "Can", saat: "-", hizmet: "-", isletme: "-",
  });
  assert.equal(out, "Selam Can {bilinmeyen}");
});
