// tests/depot-db.test.ts — merkez depo: alış depoya girer, transferle şubeye dağılır.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { stockLevels } = await import("@/lib/admin/stock");
const { recordPurchase } = await import("@/lib/admin/purchase");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "DEPO-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("depo: alış depo stoğuna girer, şube stoğu değişmez; transfer iki tarafı da günceller", async () => {
  const { depo, sube, product } = await withTenant(t.id, async (tx) => {
    const [depo] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez Depo", kind: "depo" }).returning();
    const [sube] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Şube" }).returning();
    const [product] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Un", price: 100, vatRate: 1, trackStock: true, unit: "kg" }).returning();
    assert.equal(sube.kind, "sube");
    const r = await recordPurchase(tx, t.id, null, { storeId: depo.id, supplierId: null, docNo: "D1", date: "2026-10-20", note: null, lines: [{ productId: product.id, qtyMilli: 10000, unitCost: 2500 }] });
    assert.ok(!("error" in r));
    return { depo, sube, product };
  });

  const levels = await withTenant(t.id, (tx) => Promise.all([stockLevels(tx, depo.id), stockLevels(tx, sube.id)]));
  assert.equal(levels[0].find((x) => x.id === product.id)?.level, 10000);
  assert.equal(levels[1].find((x) => x.id === product.id)?.level, 0);
  const [cost] = await withTenant(t.id, (tx) => tx.select({ cost: schema.products.cost }).from(schema.products).where(eq(schema.products.id, product.id)));
  assert.equal(cost.cost, 2500);

  await withTenant(t.id, async (tx) => {
    await tx.insert(schema.stockMovements).values([
      { tenantId: t.id, storeId: depo.id, productId: product.id, kind: "transfer" as const, qtyMilli: -4000, actor: "test", note: "depodan dağıtım" },
      { tenantId: t.id, storeId: sube.id, productId: product.id, kind: "transfer" as const, qtyMilli: 4000, actor: "test", note: "depodan dağıtım" },
    ]);
  });
  const after = await withTenant(t.id, (tx) => Promise.all([stockLevels(tx, depo.id), stockLevels(tx, sube.id)]));
  assert.equal(after[0].find((x) => x.id === product.id)?.level, 6000);
  assert.equal(after[1].find((x) => x.id === product.id)?.level, 4000);
});
