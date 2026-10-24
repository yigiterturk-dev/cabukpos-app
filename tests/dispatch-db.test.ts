import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { schema, getDb, withTenant, closeDb } = await import("@/db");
const { and, eq } = await import("drizzle-orm");
const { startCourierPosition, saveCourierPosition, loadCourierPositions, stopCourierPosition } = await import("@/lib/tabs/courier-location");
const { deliveryHistory } = await import("@/lib/tabs/delivery-history");
const [tenant, other] = await getDb().insert(schema.tenants).values([{ name: "Dispatch test", vertical: "restoran" }, { name: "Other dispatch", vertical: "restoran" }]).returning();
after(async () => { await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id)); await getDb().delete(schema.tenants).where(eq(schema.tenants.id, other.id)); await closeDb(); });
const f = await withTenant(tenant.id, async tx => {
  const [store, branch] = await tx.insert(schema.stores).values([{ tenantId: tenant.id, name: "A" }, { tenantId: tenant.id, name: "B" }]).returning();
  const [staff] = await tx.insert(schema.staff).values({ tenantId: tenant.id, name: "Kurye", role: "kurye", pinHash: "test" }).returning();
  const [device] = await tx.insert(schema.devices).values({ tenantId: tenant.id, storeId: store.id, name: "Kurye", receiptPrefix: "KR", role: "kurye" }).returning();
  return { store, branch, staff, device };
});
test("courier position: only correct tenant/branch/session sees or changes point; stop cannot be undone by in-flight POST", async () => {
  const actor = { tenantId: tenant.id, storeId: f.store.id, staffId: f.staff.id, deviceId: f.device.id, sessionId: crypto.randomUUID() };
  const point = { latitude: 41, longitude: 29, accuracy: 5, timestamp: Date.now() };
  await startCourierPosition(actor);
  assert.deepEqual(await loadCourierPositions(actor), []); // no fake (0,0) marker before GPS
  assert.equal(await saveCourierPosition(actor, point), true);
  assert.equal((await loadCourierPositions(actor)).length, 1);
  assert.deepEqual(await loadCourierPositions({ ...actor, storeId: f.branch.id }), []);
  assert.deepEqual(await loadCourierPositions({ ...actor, tenantId: other.id }), []);
  assert.equal(await saveCourierPosition({ ...actor, storeId: f.branch.id }, point), false);
  assert.equal(await saveCourierPosition({ ...actor, tenantId: other.id }, point), false);
  assert.equal(await saveCourierPosition({ ...actor, sessionId: crypto.randomUUID() }, point), false);
  const next = { ...actor, sessionId: crypto.randomUUID() };
  await startCourierPosition(next);
  await stopCourierPosition(actor); // old browser cannot stop newly started session
  assert.equal(await saveCourierPosition(next, point), true);
  await stopCourierPosition(next);
  assert.equal(await saveCourierPosition(next, point), false);
  assert.deepEqual(await loadCourierPositions(next), []);
});
test("courier position: stale point expires and RLS blocks cross-tenant write", async () => {
  const actor = { tenantId: tenant.id, storeId: f.store.id, staffId: f.staff.id, deviceId: f.device.id, sessionId: crypto.randomUUID() };
  const now = Date.now();
  await startCourierPosition(actor); await saveCourierPosition(actor, { latitude: 41, longitude: 29, accuracy: 5, timestamp: now }, now);
  assert.deepEqual(await loadCourierPositions(actor, now + 16 * 60000), []);
  await assert.rejects(withTenant(other.id, tx => tx.insert(schema.courierLocations).values({ ...actor, active: true, latitudeE6: 41000000, longitudeE6: 29000000, accuracy: 5, observedAt: new Date() })));
});
test("delivery history: folds complete order across midnight, includes closed orders, excludes another branch/tenant", async () => {
  const tabId = crypto.randomUUID(), wrongBranch = crypto.randomUUID();
  const row = (id: string, type: string, payload: unknown, at: string, storeId = f.store.id) => ({ id: crypto.randomUUID(), tenantId: tenant.id, storeId, tabId: id, at: new Date(at), type, payload });
  await withTenant(tenant.id, tx => tx.insert(schema.tabEvents).values([
    row(tabId, "open", { type: "open", kind: "paket", guests: 0 }, "2026-10-23T23:58:00+03:00"),
    row(tabId, "add", { type: "add", lineId: crypto.randomUUID(), productId: null, name: "Tost", unitPrice: 15000, vatRate: 10, qtyMilli: 1000, stationId: null, options: [], note: null }, "2026-10-23T23:59:00+03:00"),
    row(tabId, "delivered", { type: "delivered", method: "kart" }, "2026-10-24T00:10:00+03:00"),
    row(wrongBranch, "open", { type: "open", kind: "paket", guests: 0 }, "2026-10-24T12:00:00+03:00", f.branch.id),
  ]));
  const data = await deliveryHistory({ tenantId: tenant.id, storeId: f.store.id }, "2026-10-24");
  assert.equal(data.length, 1); assert.equal(data[0].total, 15000); assert.equal(data[0].delivery.method, "kart");
  assert.equal((await deliveryHistory({ tenantId: other.id, storeId: f.store.id }, "2026-10-24")).length, 0);
  assert.equal((await deliveryHistory({ tenantId: tenant.id, storeId: f.store.id }, "2026-10-23")).length, 0);
  assert.equal((await withTenant(tenant.id, tx => tx.select().from(schema.courierLocations).where(and(eq(schema.courierLocations.tenantId, tenant.id), eq(schema.courierLocations.storeId, f.store.id))))).length, 0);
});
