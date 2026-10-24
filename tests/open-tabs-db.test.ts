// tests/open-tabs-db.test.ts — açık adisyon sayacı: kapanan adisyon sayılmaz, kalan tutar katlanır.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { openTabCounts } = await import("@/lib/admin/tabs");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "ADISYON-T", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("açık adisyon: kapanan sayılmaz; masa/paket ayrılır, kalan tutar toplanır", async () => {
  const [store] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "Salon" }).returning());
  const at = new Date(Date.UTC(2026, 9, 20, 10, 0));
  const lineId = crypto.randomUUID();
  const closed = crypto.randomUUID(), masa = crypto.randomUUID(), paket = crypto.randomUUID();
  const row = (tabId: string, type: string, payload: unknown, min: number) => ({ id: crypto.randomUUID(), tenantId: t.id, storeId: store.id, tabId, at: new Date(at.getTime() + min * 60_000), type, payload });
  await withTenant(t.id, (tx) => tx.insert(schema.tabEvents).values([
    row(closed, "open", { type: "open", guests: 2, kind: "masa" }, 0),
    row(closed, "add", { type: "add", lineId, productId: null, name: "Çay", unitPrice: 1000, vatRate: 10, qtyMilli: 2000, options: [], note: null, stationId: null }, 1),
    row(closed, "paid", { type: "paid", saleId: crypto.randomUUID(), amount: 2000, lines: [{ lineId, qtyMilli: 2000, discount: 0 }] }, 2),
    row(masa, "open", { type: "open", guests: 4 }, 3),
    row(paket, "open", { type: "open", guests: 1, kind: "paket" }, 4),
    row(paket, "add", { type: "add", lineId: crypto.randomUUID(), productId: null, name: "Tost", unitPrice: 1500, vatRate: 10, qtyMilli: 1500, options: [], note: null, stationId: null }, 5),
  ]));
  const counts = await withTenant(t.id, (tx) => openTabCounts(tx, [store.id]));
  assert.deepEqual(counts.get(store.id), { open: 2, masa: 1, paket: 1, remaining: 2250 });
});
