import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { saveCountedStockLine, lockOpenStockCount, openStockCount } = await import("@/lib/admin/stock-count");
const { eq } = await import("drizzle-orm");

const [tenant] = await getDb().insert(schema.tenants).values({ name: "COUNT-SCOPE-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await closeDb();
});
const fixture = () => withTenant(tenant.id, async (tx) => {
  const stores = await tx.insert(schema.stores).values([
    { tenantId: tenant.id, name: "A" }, { tenantId: tenant.id, name: "B" },
  ]).returning();
  const [product] = await tx.insert(schema.products).values({ tenantId: tenant.id, name: "Un", price: 100, vatRate: 1, trackStock: true, unit: "kg", kind: "tartili" }).returning();
  const counts = await tx.insert(schema.stockCounts).values(stores.map((s) => ({ tenantId: tenant.id, storeId: s.id, openedBy: "test" }))).returning();
  const lines = await tx.insert(schema.stockCountLines).values(counts.map((c) => ({ tenantId: tenant.id, countId: c.id, productId: product.id, expectedMilli: 5000 }))).returning();
  return { stores, counts, lines, actor: { role: "mudur" as const, storeId: stores[0].id } };
});

test("sayım: kendi oturumuyla başka şubenin veya aynı şubenin başka oturum satırı değiştirilemez", async () => {
  const { stores, counts, lines, actor } = await fixture();
  const other = await withTenant(tenant.id, async (tx) => {
    const [count] = await tx.insert(schema.stockCounts).values({ tenantId: tenant.id, storeId: stores[0].id, openedBy: "test" }).returning();
    const [line] = await tx.insert(schema.stockCountLines).values({ tenantId: tenant.id, countId: count.id, productId: lines[0].productId, expectedMilli: 5000 }).returning();
    return line;
  });
  for (const line of [lines[1], other]) {
    const result = await withTenant(tenant.id, (tx) => saveCountedStockLine(tx, actor, counts[0].id, line.id, "2,5"));
    assert.equal(result?.error, "Satır bulunamadı.");
    const [unchanged] = await withTenant(tenant.id, (tx) => tx.select().from(schema.stockCountLines).where(eq(schema.stockCountLines.id, line.id)));
    assert.equal(unchanged.countedMilli, null);
  }
  assert.equal((await withTenant(tenant.id, (tx) => saveCountedStockLine(tx, actor, counts[1].id, lines[1].id, "2,5")))?.error, "Oturum kapalı.");
  assert.equal(await withTenant(tenant.id, (tx) => saveCountedStockLine(tx, actor, counts[0].id, lines[0].id, "2,5")), null);
  const [saved] = await withTenant(tenant.id, (tx) => tx.select().from(schema.stockCountLines).where(eq(schema.stockCountLines.id, lines[0].id)));
  assert.equal(saved.countedMilli, 2500);
});

test("sayım: kapanış kilidini bekleyen satır yazımı kapalı oturumu değiştirmez", async () => {
  const { counts, lines, actor } = await fixture();
  let unlock!: () => void;
  let locked!: () => void;
  const release = new Promise<void>((resolve) => { unlock = resolve; });
  const ready = new Promise<void>((resolve) => { locked = resolve; });
  const closing = withTenant(tenant.id, async (tx) => {
    assert.ok(await lockOpenStockCount(tx, counts[0].id, actor));
    locked();
    await release;
    await tx.update(schema.stockCounts).set({ status: "kapandi" }).where(eq(schema.stockCounts.id, counts[0].id));
  });
  await Promise.race([ready, closing]);
  const saving = withTenant(tenant.id, (tx) => saveCountedStockLine(tx, actor, counts[0].id, lines[0].id, "3"));
  unlock();
  const [, result] = await Promise.all([closing, saving]);
  assert.equal(result?.error, "Oturum kapalı.");
  const [unchanged] = await withTenant(tenant.id, (tx) => tx.select().from(schema.stockCountLines).where(eq(schema.stockCountLines.id, lines[0].id)));
  assert.equal(unchanged.countedMilli, null);
});

test("sayım: eşzamanlı açılışlar aynı şubede yalnız bir oturum oluşturur", async () => {
  const [store] = await withTenant(tenant.id, (tx) => tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Eşzamanlı sayım" }).returning());
  const actor = { id: crypto.randomUUID(), role: "mudur" as const, storeId: store.id };
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    withTenant(tenant.id, (tx) => openStockCount(tx, tenant.id, actor, store.id))));
  assert.equal(results.filter((r) => "id" in r).length, 1);
  assert.equal(results.filter((r) => "error" in r).length, 3);
  const counts = await withTenant(tenant.id, (tx) => tx.select().from(schema.stockCounts).where(eq(schema.stockCounts.storeId, store.id)));
  assert.equal(counts.length, 1);
  const lines = await withTenant(tenant.id, (tx) => tx.select().from(schema.stockCountLines).where(eq(schema.stockCountLines.countId, counts[0].id)));
  assert.ok(lines.length > 0, "yeni sayım stok anlık görüntüsünü içermeli");
});
