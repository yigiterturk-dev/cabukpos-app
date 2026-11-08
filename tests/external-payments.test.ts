// tests/external-payments.test.ts — dış ödeme özeti: idempotency, kiracı izolasyonu, şube doğrulama, audit.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { recordExternalPayment } = await import("@/lib/integrations/payments");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "EXT-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "EXT-T2", vertical: "restoran" }).returning();
const [store] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning());
const base = {
  tenantId: t.id, storeId: store.id, source: "yanindapos", externalId: "yp-1",
  amount: 15000, currency: "TRY", method: "kart", paidAt: new Date("2026-11-08T10:00:00Z"), actor: "integration:test",
};

test("dış ödeme: oluşturur; aynı externalId tekrarında duplicate, ilk kayıt korunur", async () => {
  const first = await recordExternalPayment(base);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.duplicate, false);
  const again = await recordExternalPayment({ ...base, amount: 99999 });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.duplicate, true);
  assert.equal(again.id, first.id);
  const rows = await withTenant(t.id, (tx) => tx.select().from(schema.externalPayments));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 15000);
  const audits = await withTenant(t.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "integration.external_payment")));
  assert.equal(audits.length, 1);
});

test("kiracı izolasyonu: başka kiracı satırı görmez", async () => {
  const rows = await withTenant(t2.id, (tx) => tx.select().from(schema.externalPayments));
  assert.equal(rows.length, 0);
});

test("geçersiz/başka kiracının şubesi reddedilir", async () => {
  const bad = await recordExternalPayment({ ...base, externalId: "yp-2", storeId: crypto.randomUUID() });
  assert.deepEqual(bad, { ok: false, error: "store_not_found" });
});

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});
