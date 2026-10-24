// tests/invite.test.ts — davet bağlantısı gerçek jeton taşır (Promise sızıntısı regresyonu).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.APP_URL = "https://cabukpos.test";
const { inviteLink } = await import("@/lib/auth/invite");
const { verifyJwt } = await import("@/lib/auth/jwt");
const { INVITE_SECONDS } = await import("@/lib/auth/reset");

test("davet: bağlantı çözülmüş jeton taşır, 3 gün geçerli", async () => {
  const link = await inviteLink({ id: "user-1", passwordHash: "hash", tokenVersion: 0 });
  assert.ok(link.startsWith("https://cabukpos.test/sifre-yenile?t="), link);
  assert.ok(!link.includes("object"), "jeton çözülmemiş (Promise) olmamalı");
  const token = link.split("t=")[1];
  assert.equal(token.split(".").length, 3);
  const p = await verifyJwt("reset", token);
  assert.equal(p?.sub, "user-1");
  assert.equal(typeof p?.ph, "string");
  assert.equal(p?.v, 0);
  const ttl = Number(p!.exp) - Math.floor(Date.now() / 1000);
  assert.ok(ttl > INVITE_SECONDS - 120 && ttl <= INVITE_SECONDS, `ttl=${ttl}`);
});
