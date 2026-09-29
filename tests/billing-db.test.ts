// tests/billing-db.test.ts — cabukpos_test, uygulama rolü. Deneme varsayılanı + ödeme idempotentliği.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema } = await import("@/db");
const { createPayment, completePayment, tenantBilling } = await import("@/lib/billing/service");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "ABONE-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("yeni işletme 14 gün deneme", async () => {
  const b = (await tenantBilling(t.id))!;
  const days = (b.trialEndsAt.getTime() - Date.now()) / 86400_000;
  assert.ok(days > 13.9 && days <= 14.01, String(days));
  assert.equal(b.paidUntil, null);
});

test("ödeme: başarısız uzatmaz, başarılı bir kez uzatır", async () => {
  const f = await createPayment(t.id, "fake", "aylik", 100);
  assert.equal(await completePayment(f.id, false, "x"), "basarisiz");
  assert.equal(await completePayment(f.id, true, "x"), "zaten");
  assert.equal((await tenantBilling(t.id))!.paidUntil, null);
  const p = await createPayment(t.id, "fake", "yillik", 1000);
  const rs = await Promise.all([completePayment(p.id, true, "a"), completePayment(p.id, true, "b")]);
  assert.deepEqual(rs.sort(), ["odendi", "zaten"]);
  const b = (await tenantBilling(t.id))!;
  const exp = new Date(b.trialEndsAt);
  exp.setUTCFullYear(exp.getUTCFullYear() + 1);
  assert.equal(b.paidUntil!.toISOString(), exp.toISOString());
});
