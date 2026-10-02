// tests/schema-prep.test.ts — users tablosuna eklenen kolonların şema varlığı (DB gerektirmez).
import { test } from "node:test";
import assert from "node:assert/strict";
import { users } from "../db/schema";

test("users: emailVerifiedAt ve totpSecret kolonları tanımlı", () => {
  assert.ok(users.emailVerifiedAt);
  assert.ok(users.totpSecret);
  assert.equal(users.emailVerifiedAt.name, "email_verified_at");
  assert.equal(users.totpSecret.name, "totp_secret");
});
