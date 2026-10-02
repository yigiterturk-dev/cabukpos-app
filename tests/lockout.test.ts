// tests/lockout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAIL_THRESHOLD, WINDOW_MINUTES, failKey, shouldLock } from "@/lib/auth/lockout";

test("başarısız giriş kilidi", () => {
  assert.equal(shouldLock(FAIL_THRESHOLD - 1), false);
  assert.equal(shouldLock(FAIL_THRESHOLD), true);
  assert.equal(failKey("A@B.co"), "hata:a@b.co");
  assert.ok(WINDOW_MINUTES >= 5);
});
