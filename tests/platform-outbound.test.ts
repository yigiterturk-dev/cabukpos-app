// tests/platform-outbound.test.ts — #29: menü/fiyat/stok geri push (mock adaptör + Getir sandbox sürücüsü).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { pushStoreCatalog } = await import("@/lib/platform/outbound");
const { createGetirSource } = await import("@/lib/platform/getir");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "PKO-T", vertical: "market" }).returning();
const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [p1] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Su", price: 1500, vatRate: 10, trackStock: false }).returning();
  const [p2] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Kola", price: 3000, vatRate: 10, trackStock: true }).returning();
  await tx.insert(schema.productPlatformCodes).values({ tenantId: t.id, storeId: store.id, platform: "mock", code: "SU", productId: p1.id });
  await tx.insert(schema.productPlatformCodes).values({ tenantId: t.id, storeId: store.id, platform: "mock", code: "KOLA", productId: p2.id });
  await tx.insert(schema.productPlatformCodes).values({ tenantId: t.id, storeId: store.id, platform: "getir", code: "GET-SU", productId: p1.id });
  const [conn] = await tx.insert(schema.platformConnections).values({ tenantId: t.id, storeId: store.id, platform: "mock", webhookSecret: "gizli", active: true }).returning();
  return { store, p1, p2, conn };
});
const connObj = { id: setup.conn.id, tenantId: t.id, storeId: setup.store.id, platform: "mock", credentials: null, webhookSecret: "gizli", autoAccept: true, active: true };

test("mock'a push: eşlenmiş ürünler ok sayılır, audit yazılır", async () => {
  const r = await pushStoreCatalog(t.id, setup.store.id, "mock", "test");
  assert.deepEqual(r, { ok: 2, failed: 0, total: 2 });
});

test("bağlantısız platform not_connected; eşlemesiz platform no_items", async () => {
  assert.deepEqual(await pushStoreCatalog(t.id, setup.store.id, "getir", "test"), { error: "not_connected" });
  await getDb().insert(schema.platformConnections).values({ tenantId: t.id, storeId: setup.store.id, platform: "getir", webhookSecret: "g", active: true });
  assert.deepEqual(await pushStoreCatalog(t.id, setup.store.id, "getir", "test"), { error: "unsupported" }); // Getir env kapalı → adaptör error döner
});

test("Getir sandbox pushCatalog: env kapalı error, açıkken gövde + cevap; mock fail anahtarı hata yolu", async () => {
  const off = createGetirSource(false);
  assert.deepEqual(await off.pushCatalog!(connObj, []), { error: "Getir bağlantısı kapalı." });
  const oldFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (async (_url, init) => {
    body = (init?.body as string) ?? "";
    return new Response(JSON.stringify({ ok: 1, failed: 0 }), { status: 200 });
  }) as typeof fetch;
  const on = createGetirSource(true, { base: "https://getir.test", key: "k" });
  const r = await on.pushCatalog!(connObj, [{ code: "GET-SU", name: "Su", price: 1500, stock: 12, active: true }]);
  assert.deepEqual(r, { ok: 1, failed: 0 });
  assert.match(body, /"GET-SU"/);
  globalThis.fetch = async () => new Response("upss", { status: 502 });
  await assert.rejects(on.pushCatalog!(connObj, [{ code: "X", name: "X", price: 1, stock: null, active: true }]), /HTTP 502/);
  globalThis.fetch = oldFetch;
});

test("MOCK_PLATFORM_FAIL=1 → adaptör hata döner, pushStoreCatalog unsupported der", async () => {
  process.env.MOCK_PLATFORM_FAIL = "1";
  const r = await pushStoreCatalog(t.id, setup.store.id, "mock", "test");
  delete process.env.MOCK_PLATFORM_FAIL;
  assert.deepEqual(r, { error: "unsupported" });
});

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});
