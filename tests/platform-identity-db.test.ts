import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { and, eq, sql } = await import("drizzle-orm");
const { provisionConnection } = await import("@/lib/platform/provision");
const { ingestOrders } = await import("@/lib/platform/ingest");
const { sourceFor } = await import("@/lib/platform");
const { kioskOrder } = await import("@/lib/kiosk");

const [tenant] = await getDb().insert(schema.tenants).values({ name: "Platform identity test", vertical: "restoran" }).returning();
const { store, product } = await withTenant(tenant.id, async tx => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
  const [product] = await tx.insert(schema.products).values({ tenantId: tenant.id, name: "Köfte", price: 12000, vatRate: 10 }).returning();
  return { store, product };
});
const mock = await provisionConnection(tenant.id, store.id, "mock", "test:admin");
const getir = await provisionConnection(tenant.id, store.id, "getir", "test:admin");
assert.ok(mock); assert.ok(getir);
// Test acknowledgement handling without enabling or contacting a real provider.
const driver = sourceFor("getir")!;
const originalAccept = driver.accept;
driver.accept = async () => {};
after(async () => {
  driver.accept = originalAccept;
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await closeDb();
});
const incoming = (externalId: string) => ({ externalId, customer: { name: "Demo", phone: "05550000111" }, address: "Örnek", directions: null, note: null, payIntent: "online" as const, deadline: null, lines: [{ code: "KOFTE", name: "Köfte", unitPrice: 12000, qtyMilli: 1000, note: null }] });
const orders = (externalId: string) => withTenant(tenant.id, tx => {
  const E = schema.tabEvents;
  return tx.select().from(E).where(and(eq(E.storeId, store.id), eq(E.type, "order"), sql`${E.payload}->'source'->>'externalId' = ${externalId}`));
});

test("aynı şubede aynı numara iki platformda ayrı adisyon, mutfak bileti ve kabul bildirimi oluşturur", async () => {
  const order = incoming("SAME-001");
  for (const conn of [mock, getir]) {
    assert.equal((await ingestOrders(conn, [order])).created, 1);
    assert.equal((await ingestOrders(conn, [order])).duplicates, 1);
  }
  const rows = await orders(order.externalId);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].tabId, rows[1].tabId);
  for (const row of rows) {
    const counts = await withTenant(tenant.id, async tx => {
      const events = await tx.select().from(schema.tabEvents).where(eq(schema.tabEvents.tabId, row.tabId));
      const audits = await tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.accept"));
      return { tickets: events.filter(e => e.type === "send").length, accepts: audits.filter(a => (a.detail as { tabId?: string }).tabId === row.tabId).length };
    });
    assert.deepEqual(counts, { tickets: 1, accepts: 1 });
  }
});

test("eşzamanlı tekrarlar her platformda bir sipariş oluşturur", async () => {
  const order = incoming("CONCURRENT-001");
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => ingestOrders({ ...(i % 2 ? mock : getir), autoAccept: false }, [order])));
  assert.equal(results.reduce((n, r) => n + r.created, 0), 2);
  assert.equal(results.reduce((n, r) => n + r.duplicates, 0), 6);
  assert.equal((await orders(order.externalId)).length, 2);
});

test("veritabanı aynı şube ve platformda tekrar numarayı doğrudan yazmaya izin vermez", async () => {
  const order = incoming("CONSTRAINT-001");
  await ingestOrders(mock, [order]);
  const [row] = await orders(order.externalId);
  await assert.rejects(withTenant(tenant.id, tx => tx.insert(schema.tabEvents).values({ id: crypto.randomUUID(), tenantId: tenant.id, storeId: store.id, tabId: crypto.randomUUID(), at: new Date(), type: "order", payload: row.payload })), e => (e as { cause?: { code?: string } }).cause?.code === "23505");
});

test("kiosk tekrar isteği başka platformun adisyonuna bağlanmaz", async () => {
  const requestId = crypto.randomUUID();
  const order = incoming(`k-${requestId}`);
  await ingestOrders(mock, [order]);
  const conn = await provisionConnection(tenant.id, store.id, "kiosk", "test:admin");
  assert.ok(conn);
  const input = { requestId, name: "Demo kiosk", phone: "", note: null, payIntent: "nakit" as const, lines: [{ productId: product.id, qtyMilli: 1000, note: null }] };
  const first = await kioskOrder(conn, input);
  assert.equal(first.ok, true);
  assert.deepEqual(await kioskOrder(conn, input), first);
  const rows = await orders(order.externalId);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].tabId, rows[1].tabId);
});
