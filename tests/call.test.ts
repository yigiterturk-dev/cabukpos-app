// tests/call.test.ts — Garson çağrısı: kiosko sırrı, masa doğrulama, masa başına tek açık çağrı, çözüm, menüde masalar.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { callWaiter, openCalls, resolveCall, callCount } = await import("@/lib/call");
const { menuByStore } = await import("@/lib/kiosk");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

async function fixture(name: string) {
  const [t] = await getDb().insert(schema.tenants).values({ name, vertical: "restoran" }).returning();
  made.push(t.id);
  return withTenant(t.id, async (tx) => {
    const [st] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
    const [area] = await tx.insert(schema.areas).values({ tenantId: t.id, storeId: st.id, name: "Salon" }).returning();
    const [table] = await tx.insert(schema.tables).values({ tenantId: t.id, areaId: area.id, name: "5" }).returning();
    await tx.insert(schema.platformConnections).values({ tenantId: t.id, storeId: st.id, platform: "kiosk", webhookSecret: "s3cret-call-secret", webhookToken: "tok_" + name.toLowerCase() });
    return { t, st, area, table };
  });
}

test("çağrı: sırrız/kapalı kiosko reddedilir, masa mağazaya bağlı olmalı", async () => {
  const f = await fixture("CALL-A");
  assert.equal((await callWaiter(f.st.id, "yanlis-sirr-123", f.table.id, null)).ok, false);
  assert.equal((await callWaiter(f.st.id, "s3cret-call-secret", crypto.randomUUID(), null)).ok, false);
  const r = await callWaiter(f.st.id, "s3cret-call-secret", f.table.id, "menü lütfen");
  assert.deepEqual(r, { ok: true });
});

test("çağrı: masa başına tek açık çağrı; çözülünce yenisi alınır", async () => {
  const f = await fixture("CALL-B");
  await callWaiter(f.st.id, "s3cret-call-secret", f.table.id, null);
  await callWaiter(f.st.id, "s3cret-call-secret", f.table.id, null); // tekrar: sessiz
  assert.equal(await callCount(f.t.id, f.st.id), 1);
  const calls = await openCalls(f.t.id, f.st.id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "Salon · 5");
  assert.equal(await resolveCall(f.t.id, f.st.id, calls[0].id, "device:x"), true);
  assert.equal(await callCount(f.t.id, f.st.id), 0);
  await callWaiter(f.st.id, "s3cret-call-secret", f.table.id, null);
  assert.equal(await callCount(f.t.id, f.st.id), 1);
});

test("menü: masalar herkese açık veride bölge · masa adıyla döner", async () => {
  const f = await fixture("CALL-C");
  const m = await menuByStore(f.st.id);
  assert.deepEqual(m?.tables, [{ id: f.table.id, name: "Salon · 5" }]);
});
