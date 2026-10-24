// tests/franchise-db.test.ts — franchise raporu: depo dışlanır, ciro payı HQ verisinden hesaplanır.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { franchiseData, franchiseCsv } = await import("@/lib/admin/franchise");
const { istToday } = await import("@/lib/core/report");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "FRANCHISE-T", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("franchise: depo rapora girmez; ciro payı net cirodan hesaplanır, CSV'ye yazılır", async () => {
  const { sube, staff, product, device } = await withTenant(t.id, async (tx) => {
    await tx.insert(schema.stores).values({ tenantId: t.id, name: "Depo", kind: "depo", royaltyBps: 900 });
    const [sube] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Kadıköy", royaltyBps: 500 }).returning();
    const [staff] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
    const [product] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 10000, vatRate: 10 }).returning();
    const [device] = await tx.insert(schema.devices).values({ tenantId: t.id, storeId: sube.id, name: "Kasa", receiptPrefix: "F1" }).returning();
    return { sube, staff, product, device };
  });
  const ctx = { tenantId: t.id, storeId: sube.id, deviceId: device.id, receiptPrefix: "F1" };
  const shiftId = crypto.randomUUID(), at = new Date().toISOString();
  assert.equal((await applyDoc(ctx, { kind: "shift_open", id: shiftId, staffId: staff.id, at, openingCash: 0 })).ok, true);
  assert.equal((await applyDoc(ctx, {
    kind: "sale", id: crypto.randomUUID(), shiftId, staffId: staff.id, receiptSeq: 1, at,
    lines: [{ productId: product.id, name: "Döner", unitPrice: 10000, vatRate: 10, qtyMilli: 1000 }],
    payments: [{ method: "nakit", amount: 10000 }],
  })).ok, true);

  const r = { bas: istToday(), bit: istToday() };
  const d = await withTenant(t.id, (tx) => franchiseData(tx, r));
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0].storeId, sube.id);
  assert.equal(d.rows[0].sales, 10000);
  assert.equal(d.rows[0].royalty, 500);
  assert.equal(d.totals.royalty, 500);
  const csv = franchiseCsv(d);
  assert.ok(csv.includes("Kadıköy"));
  assert.ok(!csv.includes("Depo;"), "depo satırı CSV'ye girmemeli");
  assert.ok(csv.startsWith("\ufeff"));
});
