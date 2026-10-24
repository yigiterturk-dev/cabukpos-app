// tests/verify-email.test.ts — e-posta doğrulama bağlantısı: amaca özel, e-posta değişince bozulur.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
const { checkDogrula, dogrulaToken } = await import("@/lib/auth/verify-email");

const u = { id: "22222222-2222-4222-8222-222222222222", email: "a@b.co", active: true, emailVerifiedAt: null as Date | null };
const lookup = (row: typeof u | null) => async () => row;

test("geçerli bağlantı ok döner", async () => {
  assert.deepEqual(await checkDogrula(await dogrulaToken(u), lookup(u)), { durum: "ok", userId: u.id });
});

test("doğrulanmış hesapta zaten döner", async () => {
  assert.equal((await checkDogrula(await dogrulaToken(u), lookup({ ...u, emailVerifiedAt: new Date() }))).durum, "zaten");
});

test("e-posta değişince bozulur", async () => {
  assert.equal((await checkDogrula(await dogrulaToken(u), lookup({ ...u, email: "yeni@b.co" }))).durum, "bozuk");
});

test("pasif kullanıcı ve bozuk jeton reddedilir", async () => {
  assert.equal((await checkDogrula(await dogrulaToken(u), lookup({ ...u, active: false }))).durum, "bozuk");
  assert.equal((await checkDogrula("bozuk", lookup(u))).durum, "bozuk");
});

test("reset amacındaki jeton doğrulamada kullanılamaz", async () => {
  const { resetToken } = await import("@/lib/auth/reset");
  assert.equal((await checkDogrula(await resetToken({ id: u.id, passwordHash: "x", tokenVersion: 0 }), lookup(u))).durum, "bozuk");
});
