// tests/external-payments-api.test.ts — POST /api/v1/payments/external: kapsam, idempotency, doğrulama, boyut.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { createKey } = await import("@/lib/integrations/keys");
const { POST } = await import("@/app/api/v1/payments/external/route");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "EXT-API", vertical: "restoran" }).returning();
const [store] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning());
const payments = await createKey(t.id, "YanındaPOS", "payments");
const stats = await createKey(t.id, "Ajans", "stats");

function send(token: string | null, payload: unknown) {
  return POST(new Request("http://localhost/api/v1/payments/external", {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

const payload = { externalId: "api-1", amount: 1234, paidAt: "2026-11-08T10:00:00Z", method: "nakit", storeId: store.id };

test("payments scope: 201 oluşturur, aynı externalId 200 duplicate", async () => {
  const created = await send(payments.key, payload);
  assert.equal(created.status, 201);
  const body = await created.json() as { ok: boolean; duplicate: boolean; id: string };
  assert.equal(body.ok, true);
  assert.equal(body.duplicate, false);
  const replay = await send(payments.key, { ...payload, amount: 9999 });
  assert.equal(replay.status, 200);
  const again = await replay.json() as { duplicate: boolean; id: string };
  assert.equal(again.duplicate, true);
  assert.equal(again.id, body.id);
});

test("yanlış kapsam 403, kimliksiz 401, geçersiz gövde 400", async () => {
  assert.equal((await send(stats.key, payload)).status, 403);
  assert.equal((await send(null, payload)).status, 401);
  assert.equal((await send(payments.key, { externalId: "api-2", amount: -1, paidAt: "x" })).status, 400);
  assert.equal((await send(payments.key, { ...payload, externalId: "api-3", currency: "XYZ" })).status, 400);
});

test("boyut sınırları: gövde 413, meta 400", async () => {
  assert.equal((await send(payments.key, { ...payload, externalId: "api-4", junk: "x".repeat(20_000) })).status, 413);
  assert.equal((await send(payments.key, { ...payload, externalId: "api-5", meta: { note: "x".repeat(5_000) } })).status, 400);
});

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});
