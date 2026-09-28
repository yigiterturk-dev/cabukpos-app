// tests/stock-db.test.ts — cabukpos_test, uygulama rolü. SQL stok düzeyi = saf stockLevel.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { stockLevels } = await import("@/lib/admin/stock");
const { stockLevel } = await import("@/lib/core/stock");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "STOK-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("SQL stok düzeyi saf hesapla aynı; takipsiz ürün listelenmez", async () => {
  const at = (m: number) => new Date(Date.UTC(2026, 8, 28, 10, m));
  const plan: Record<string, [("satis" | "iade" | "alis" | "sayim" | "fire"), number, number][]> = {
    A: [["alis", 10000, 0], ["satis", -3000, 1], ["iade", 1000, 2]],
    B: [["alis", 10000, 0], ["sayim", 20000, 5], ["satis", -3000, 6], ["satis", -2000, 4], ["fire", -500, 7]],
    C: [["sayim", 5000, 1], ["sayim", 7000, 3], ["alis", 1000, 2], ["satis", -1000, 4]],
    D: [],
  };
  const levels = await withTenant(t.id, async (tx) => {
    const [st] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
    for (const [name, moves] of Object.entries(plan)) {
      const [p] = await tx.insert(schema.products).values({ tenantId: t.id, name, price: 100, vatRate: 1, trackStock: true }).returning();
      if (moves.length) await tx.insert(schema.stockMovements).values(moves.map(([kind, q, m]) => ({ tenantId: t.id, storeId: st.id, productId: p.id, kind, qtyMilli: q, at: at(m), actor: "test" })));
    }
    await tx.insert(schema.products).values({ tenantId: t.id, name: "Takipsiz", price: 100, vatRate: 1 });
    return stockLevels(tx, st.id);
  });
  const got = Object.fromEntries(levels.map((l) => [l.name, l.level]));
  const want = Object.fromEntries(Object.entries(plan).map(([n, ms]) => [n, stockLevel(ms.map(([kind, q, m]) => ({ kind, qtyMilli: q, at: at(m).toISOString() })))]));
  assert.deepEqual(got, want);
  assert.deepEqual(want, { A: 8000, B: 16500, C: 6000, D: 0 });
});
