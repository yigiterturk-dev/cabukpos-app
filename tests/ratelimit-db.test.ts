// tests/ratelimit-db.test.ts — lib/ratelimit hit(): kayan pencere sayacı ve pencere sıfırlaması.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema } = await import("@/db");
const { eq, like } = await import("drizzle-orm");
const { hit } = await import("@/lib/ratelimit");

after(async () => {
  await getDb().delete(schema.loginAttempts).where(like(schema.loginAttempts.key, "rl-test:%"));
  await closeDb();
});

test("hit: aynı pencerede sayacı artırır", async () => {
  assert.equal(await hit("rl-test:inc"), 1);
  assert.equal(await hit("rl-test:inc"), 2);
});

test("hit: pencere dışına düşen sayaç 1'e sıfırlanır", async () => {
  const key = "rl-test:reset";
  assert.equal(await hit(key, 1), 1);
  await getDb().update(schema.loginAttempts).set({ since: new Date(Date.now() - 2 * 60_000) }).where(eq(schema.loginAttempts.key, key));
  assert.equal(await hit(key, 1), 1);
});
