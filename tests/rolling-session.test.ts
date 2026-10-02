// tests/rolling-session.test.ts — kayan oturum yenileme kararı (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRenewSession, ADMIN_SESSION_RENEW_AFTER, ADMIN_SESSION_MAX_AGE } from "@/lib/auth/session-cookie";

const NOW = 1_800_000_000;

test("taze jeton yenilenmez, eşiği aşan yenilenir", () => {
  assert.equal(shouldRenewSession(NOW - 60, NOW), false);
  assert.equal(shouldRenewSession(NOW - ADMIN_SESSION_RENEW_AFTER, NOW), false);
  assert.equal(shouldRenewSession(NOW - ADMIN_SESSION_RENEW_AFTER - 1, NOW), true);
});

test("iat'sız (eski sürüm) jeton yenilenir", () => {
  assert.equal(shouldRenewSession(undefined, NOW), true);
  assert.equal(shouldRenewSession("1800000000", NOW), true);
});

test("sabitler: 14 gün ömür, 1 gün eşik", () => {
  assert.equal(ADMIN_SESSION_MAX_AGE, 60 * 60 * 24 * 14);
  assert.equal(ADMIN_SESSION_RENEW_AFTER, 60 * 60 * 24);
});
