// tests/reset.test.ts — şifre sıfırlama bağlantısı: tek kullanımlık, amaca özel.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
const { resetToken, checkReset } = await import("@/lib/auth/reset");
const { signJwt } = await import("@/lib/auth/jwt");

const u = { id: "11111111-1111-4111-8111-111111111111", passwordHash: "$2a$12$eskiözet", active: true };
const lookup = (row: typeof u | null) => async () => row;

test("geçerli bağlantı kullanıcıyı verir", async () => {
  assert.equal(await checkReset(await resetToken(u), lookup(u)), u.id);
});

test("şifre değişince aynı bağlantı geçersiz (tek kullanımlık)", async () => {
  const t = await resetToken(u);
  assert.equal(await checkReset(t, lookup({ ...u, passwordHash: "$2a$12$yeniözet" })), null);
});

test("pasif kullanıcı, silinmiş kullanıcı, bozuk token, başka amaçlı JWT reddedilir", async () => {
  const t = await resetToken(u);
  assert.equal(await checkReset(t, lookup({ ...u, active: false })), null);
  assert.equal(await checkReset(t, lookup(null)), null);
  assert.equal(await checkReset(t.slice(0, -2) + "xx", lookup(u)), null);
  const admin = await signJwt("admin", { sub: u.id, ph: "x" }, 60);
  assert.equal(await checkReset(admin, lookup(u)), null);
});
