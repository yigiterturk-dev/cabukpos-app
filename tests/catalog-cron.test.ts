// tests/catalog-cron.test.ts — saatlik katalog/stok push cron'u: pencere, destek/aktif filtreleri.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { pushDueCatalogs } = await import("@/lib/platform/catalog-cron");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "PKC-T", vertical: "market" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [prod] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Su", price: 1000, vatRate: 1, trackStock: true }).returning();
  await tx.insert(schema.productPlatformCodes).values({ tenantId: t.id, storeId: store.id, platform: "mock", code: "SU", productId: prod.id });
  return { store };
});
const [conn] = await getDb().insert(schema.platformConnections).values({ tenantId: t.id, storeId: s.store.id, platform: "mock", webhookSecret: "gizli" }).returning();
const [kioskConn] = await getDb().insert(schema.platformConnections).values({ tenantId: t.id, storeId: s.store.id, platform: "kiosk", webhookSecret: "gizli" }).returning();

test("saatlik katalog push: eşlemeli aktif bağlantıya gider, pencere kapanır; push desteksizi atlar", async () => {
  const r = await pushDueCatalogs();
  assert.ok(r.ok >= 1, `mock bağlantısı push'lanmalı: ${JSON.stringify(r)}`);
  const [row] = await getDb().select().from(schema.platformConnections).where(eq(schema.platformConnections.id, conn.id));
  assert.ok(row.lastCatalogPushAt, "pencere damgası basılmalı");
  // Desteklemeyen (kiosk) bağlantıya damga basılmaz, pencere her turda gelir ama ok/failed üretmez
  const [kioskRow] = await getDb().select().from(schema.platformConnections).where(eq(schema.platformConnections.id, kioskConn.id));
  assert.equal(kioskRow.lastCatalogPushAt, null);
  // Taze pencere → bu turda push üretilmez (kiosk atlanır)
  const again = await pushDueCatalogs();
  assert.equal(again.ok + again.failed, 0);
  // Kapalı bağlantı taramaya girmez
  await getDb().update(schema.platformConnections).set({ active: false, lastCatalogPushAt: null }).where(eq(schema.platformConnections.id, conn.id));
  const inactive = await pushDueCatalogs();
  assert.equal(inactive.ok + inactive.failed, 0);
});

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});
