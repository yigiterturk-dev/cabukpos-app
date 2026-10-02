// tests/api-guard.test.ts — API rol kapısının saf kararı.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiRole, type Admin } from "@/lib/auth/api";

const admin = (role: Admin["role"]): Admin =>
  ({ id: "u1", name: "A", email: "a@b.local", role, tenantId: "t1", tenantName: "T", vertical: "restoran", emailVerified: true, billing: { state: "aktif", daysLeft: 10, warn: false, locked: false } }) as unknown as Admin;

test("apiRole: izinli rol geçer, dışındakiler 403", () => {
  assert.equal(apiRole(admin("sahip"), ["sahip", "mudur"]), null);
  assert.equal(apiRole(admin("mudur"), ["sahip", "mudur"]), null);
  assert.equal(apiRole(admin("mudur"), ["sahip"])?.status, 403);
});
