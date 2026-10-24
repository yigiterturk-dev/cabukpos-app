// tests/store-visibility-db.test.ts — şube bazlı 86: public menü gizli ürünü döndürmez.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { menuByStore } = await import("@/lib/kiosk");
const { stockLevels } = await import("@/lib/admin/stock");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "GORUNURLUK-T", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("şube bazlı gizli ürün QR menüden düşer, diğer ürün kalır", async () => {
  const { store, acik, gizli } = await withTenant(t.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
    const [acik] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Açık Ürün", price: 1000, vatRate: 10 }).returning();
    const [gizli] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Gizli Ürün", price: 2000, vatRate: 10 }).returning();
    await tx.insert(schema.storeProductSettings).values({ tenantId: t.id, storeId: store.id, productId: gizli.id, active: false });
    return { store, acik, gizli };
  });
  const before = await menuByStore(store.id);
  assert.ok(before);
  const ids = before.products.map((p) => p.id);
  assert.ok(ids.includes(acik.id));
  assert.ok(!ids.includes(gizli.id), "gizli ürün menüde olmamalı");
  assert.equal(before.products.length, 1);
});

test("şube kritik stok eşiği ürün varsayılanını ezer; boşsa varsayılan geçerli", async () => {
  const { store, product, defaults } = await withTenant(t.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Şube 2" }).returning();
    const [product] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Eşik Ürünü", price: 1000, vatRate: 10, trackStock: true, minStock: 5000 }).returning();
    await tx.insert(schema.stockMovements).values({ tenantId: t.id, storeId: store.id, productId: product.id, kind: "sayim", qtyMilli: 3000, actor: "test" });
    return { store, product, defaults: await stockLevels(tx, store.id) };
  });
  const base = defaults.find((r) => r.id === product.id);
  assert.equal(base?.minStock, 5000);
  assert.equal(base?.minStockOverride, false);
  const overridden = await withTenant(t.id, async (tx) => {
    await tx.insert(schema.storeProductSettings).values({ tenantId: t.id, storeId: store.id, productId: product.id, minStock: 1000 });
    return stockLevels(tx, store.id);
  });
  const row = overridden.find((r) => r.id === product.id);
  assert.equal(row?.minStock, 1000);
  assert.equal(row?.minStockOverride, true);
});
