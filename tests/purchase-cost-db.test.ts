import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { recordPurchase } = await import("@/lib/admin/purchase");
const { stockLevels } = await import("@/lib/admin/stock");
const { eq, sql } = await import("drizzle-orm");

const [tenant] = await getDb().insert(schema.tenants).values({ name: "PURCHASE-COST-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await closeDb();
});

test("alış: eşzamanlı eski fiş yeni fişin ürün maliyetini ezmez; her iki stok girişi korunur", { timeout: 10000 }, async () => {
  const { store, product } = await withTenant(tenant.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
    const [product] = await tx.insert(schema.products).values({ tenantId: tenant.id, name: "Un", price: 5000, vatRate: 1, trackStock: true, cost: 1000, costAt: new Date("2026-10-01T00:00:00+03:00") }).returning();
    return { store, product };
  });
  const input = (date: string, unitCost: number) => ({ storeId: store.id, supplierId: null, docNo: date, date, note: null, lines: [{ productId: product.id, qtyMilli: 1000, unitCost }] });
  let release!: () => void;
  let ready!: () => void;
  const held = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const newer = withTenant(tenant.id, async (tx) => {
    const result = await recordPurchase(tx, tenant.id, null, input("2026-10-20", 3000));
    assert.ok("id" in result);
    ready();
    await gate;
  });
  await Promise.race([held, newer]);
  let olderPid = 0;
  const older = withTenant(tenant.id, async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    olderPid = connection.pid;
    return recordPurchase(tx, tenant.id, null, input("2026-10-10", 2000));
  });
  // Yeni fişin işlemi açıkken eski fişin gerçekten kilitte beklediğini gözle.
  // Zamanlama tahmini yerine PostgreSQL'in canlı bekleme durumunu kullanır.
  try {
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      if (olderPid) {
        const [state] = await getDb().execute<{ waiting: boolean }>(sql`select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = ${olderPid}`);
        if (state?.waiting) { waiting = true; break; }
      }
      await delay(10);
    }
    assert.ok(waiting, "eski fiş yeni fişin kilidini beklemeli");
  } finally {
    release();
    await Promise.all([newer, older]);
  }
  assert.ok("id" in await older);
  const [saved] = await withTenant(tenant.id, (tx) => tx.select().from(schema.products).where(eq(schema.products.id, product.id)));
  assert.equal(saved.cost, 3000);
  assert.equal(saved.costAt?.toISOString(), new Date("2026-10-20T00:00:00+03:00").toISOString());
  const levels = await withTenant(tenant.id, (tx) => stockLevels(tx, store.id));
  assert.equal(levels.find((p) => p.id === product.id)?.level, 2000);
  const purchases = await withTenant(tenant.id, (tx) => tx.select().from(schema.purchases).where(eq(schema.purchases.storeId, store.id)));
  assert.equal(purchases.length, 2);
  assert.deepEqual(purchases.map((p) => p.total).sort((a, b) => a - b), [2000, 3000]);
});

test("alış: ters ürün sıralı eşzamanlı fişler kilitlenmez; son tarih ve aynı fişte son kalem kazanır", { timeout: 10000 }, async () => {
  const { store, products } = await withTenant(tenant.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Çok kalemli alış" }).returning();
    const products = await tx.insert(schema.products).values(["A", "B"].map((name) => ({ tenantId: tenant.id, name, price: 5000, vatRate: 10, trackStock: true }))).returning();
    return { store, products };
  });
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => withTenant(tenant.id, (tx) => {
    const ordered = i % 2 ? [...products].reverse() : products;
    return recordPurchase(tx, tenant.id, null, {
      storeId: store.id, supplierId: null, docNo: `RACE-${i}`, date: `2026-10-${10 + i}`, note: null,
      lines: [
        ...ordered.map((p) => ({ productId: p.id, qtyMilli: 1000, unitCost: 1000 + i * 100 })),
        { productId: ordered[0].id, qtyMilli: 1000, unitCost: 1500 + i * 100 },
      ],
    });
  })));
  assert.ok(results.every((r) => "id" in r));
  const saved = await withTenant(tenant.id, (tx) => tx.select().from(schema.products));
  assert.equal(saved.find((p) => p.id === products[0].id)?.cost, 1300);
  assert.equal(saved.find((p) => p.id === products[1].id)?.cost, 1800);
  const levels = await withTenant(tenant.id, (tx) => stockLevels(tx, store.id));
  for (const product of products) assert.equal(levels.find((p) => p.id === product.id)?.level, 6000);
});
