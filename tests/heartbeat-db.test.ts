// tests/heartbeat-db.test.ts — sessiz ajan tespiti: pencere içi susan ajan listelenir, dıştakiler listede yok.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { silentAgents } = await import("@/lib/observability/heartbeat");
const { emptyAgentConfig } = await import("@/lib/agent/config");
const { eq } = await import("drizzle-orm");

const ago = (min: number) => new Date(Date.now() - min * 60_000);
const [t] = await getDb().insert(schema.tenants).values({ name: "HB-T", vertical: "market" }).returning();
const [s] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "HB-S" }).returning());
const base = { tenantId: t.id, storeId: s.id, pairedAt: ago(30), hubKeyEnc: "x", config: emptyAgentConfig() };
const rows = await getDb().insert(schema.agents).values([
  { ...base, name: "sustu" },                              // 30 dk önce pair, hiç görülmedi → pencere içi? pairedAt=30dk, pencere 15-75 → EVET
  { ...base, name: "yeni", pairedAt: ago(30), lastSeenAt: ago(2) },   // 2 dk önce görüldü → hayır
  { ...base, name: "eski-sessiz", pairedAt: ago(400), lastSeenAt: ago(300) }, // 5 saat sessiz → pencere dışı (dedupe)
  { ...base, name: "revoked", pairedAt: ago(30), revokedAt: ago(5) }, // iptal → hayır
]).returning({ id: schema.agents.id, name: schema.agents.name });
const byName = Object.fromEntries(rows.map((r) => [r.name, r.id]));

after(async () => {
  await getDb().delete(schema.agents).where(eq(schema.agents.tenantId, t.id));
  await getDb().delete(schema.stores).where(eq(schema.stores.id, s.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("sessiz ajan yalnız alarm penceresinde listelenir", async () => {
  const silent = await silentAgents();
  const ids = new Set(silent.map((a) => a.id));
  assert.ok(ids.has(byName["sustu"]));
  assert.ok(!ids.has(byName["yeni"]));
  assert.ok(!ids.has(byName["eski-sessiz"]));
  assert.ok(!ids.has(byName["revoked"]));
});
