// tests/sync-dirty.test.ts — #27: değişim belirteci satış/adisyon/vardiya/cihaz değişimine tepki verir.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { syncToken } = await import("@/lib/sync/dirty");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "PKS-T", vertical: "market" }).returning();

test("belirteç: boş kiracıda stabil, satış senkronunda değişir", async () => {
  const t1 = await syncToken(t.id);
  const t1b = await syncToken(t.id);
  assert.equal(t1, t1b);
  await withTenant(t.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
    const [staff] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "K", role: "kasiyer", pinHash: "x" }).returning();
    const [device] = await tx.insert(schema.devices).values({ tenantId: t.id, storeId: store.id, name: "K", receiptPrefix: "S" }).returning();
    const [shift] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId: store.id, deviceId: device.id, openedBy: staff.id, openedAt: new Date(), openingCash: 0 }).returning();
    await tx.insert(schema.sales).values({ id: crypto.randomUUID(), tenantId: t.id, storeId: store.id, deviceId: device.id, shiftId: shift.id, staffId: staff.id, receiptNo: "S-1", total: 100, vat: [{ rate: 10, gross: 100, net: 91, vat: 9 }] });
  });
  const t2 = await syncToken(t.id);
  assert.notEqual(t1, t2);
  // cihazın fiş sayacı ilerlerse (cihaz eşlemesi/sayacı) belirteç değişir
  await getDb().update(schema.devices).set({ nextReceiptNo: 5 }).where(eq(schema.devices.tenantId, t.id));
  const t3 = await syncToken(t.id);
  assert.notEqual(t2, t3);
});

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});
