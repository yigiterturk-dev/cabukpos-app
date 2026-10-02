// tests/totp.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { base32, base32Coz, newTotpSecret, otpauthUrl, totpCode, verifyTotp } from "@/lib/auth/totp";

test("base32 dönüşümü kayıpsız", () => {
  const bayt = Buffer.from([0, 1, 2, 250, 251, 77, 99]);
  assert.deepEqual(base32Coz(base32(bayt)), bayt);
  assert.match(base32(bayt), /^[A-Z2-7]+$/);
  assert.throws(() => base32Coz("AB1")); // 1 alfabe dışı
});

test("kod 6 hane, aynı adımda sabit, farklı gizliyle farklı", () => {
  const s = newTotpSecret();
  const t = Date.UTC(2026, 9, 2, 12, 0, 0);
  assert.match(totpCode(s, t), /^\d{6}$/);
  assert.equal(totpCode(s, t + 5000), totpCode(s, t)); // aynı 30 sn adımı
  assert.notEqual(totpCode(s, t), totpCode(newTotpSecret(), t));
});

test("doğrulama: güncel ve ±1 adım kabul, yanlış ve ±2 adım reddet", () => {
  const s = newTotpSecret();
  const t = Date.UTC(2026, 9, 2, 12, 0, 30);
  assert.equal(verifyTotp(s, totpCode(s, t), t), true);
  assert.equal(verifyTotp(s, totpCode(s, t - 30_000), t), true); // saat geri kaymış
  assert.equal(verifyTotp(s, totpCode(s, t + 30_000), t), true);
  assert.equal(verifyTotp(s, totpCode(s, t - 60_000), t), false);
  assert.equal(verifyTotp(s, "000000", t) && totpCode(s, t) === "000000", false);
  assert.equal(verifyTotp(s, "abc", t), false);
  assert.equal(verifyTotp(s, "12345", t), false);
});

test("kurulum çıktıları", () => {
  const s = newTotpSecret();
  assert.equal(s.length, 32);
  const url = otpauthUrl(s, "a@b.co");
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.ok(url.includes(s) && url.includes("issuer="));
});
