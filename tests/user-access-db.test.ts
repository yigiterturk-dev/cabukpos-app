import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { changeUserAccess } = await import("@/lib/admin/user-access");
const { eq, inArray, sql } = await import("drizzle-orm");
const tenants: string[] = [];
after(async () => {
  if (tenants.length) await getDb().delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  await closeDb();
});
async function fixture() {
  const [tenant] = await getDb().insert(schema.tenants).values({ name: "ACCESS-T", vertical: "market" }).returning();
  tenants.push(tenant.id);
  return withTenant(tenant.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
    const users = await tx.insert(schema.users).values(["sahip", "sahip", "mudur", "mudur", "mudur"].map((role, i) => ({
      tenantId: tenant.id, name: `Kullanıcı ${i}`, email: `${crypto.randomUUID()}@example.test`, passwordHash: "test-only",
      role: role as "sahip" | "mudur", storeId: i === 4 ? store.id : null,
    }))).returning();
    return { tenant, store, users };
  });
}

test("kullanıcı: iki sahip eşzamanlı birbirini pasifleştirdiğinde aktif sahip kalır", { timeout: 10000 }, async () => {
  const { tenant, users } = await fixture();
  const owners = users.slice(0, 2);
  let release!: () => void;
  let ready!: () => void;
  const held = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const blocker = withTenant(tenant.id, async (tx) => {
    await tx.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.id, owners.map((u) => u.id))).orderBy(schema.users.id).for("update");
    ready();
    await gate;
  });
  await Promise.race([held, blocker]);
  const pids: number[] = [];
  const changes = owners.map((actor, i) => withTenant(tenant.id, async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pids.push(connection.pid);
    return changeUserAccess(tx, tenant.id, actor.id, { userId: owners[1 - i].id, role: "sahip", storeId: null, active: false });
  }));
  try {
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      if (pids.length === 2) {
        const state = await getDb().execute<{ waiting: boolean }>(sql`select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid in (${pids[0]}, ${pids[1]})`);
        if (state.length === 2 && state.every((s) => s.waiting)) { waiting = true; break; }
      }
      await delay(10);
    }
    assert.ok(waiting, "iki erişim isteği de kilitte beklemeli");
  } finally {
    release();
    await Promise.all([blocker, ...changes]);
  }
  const results = await Promise.all(changes);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.error).length, 1);
  const saved = await getDb().select().from(schema.users).where(inArray(schema.users.id, owners.map((u) => u.id)));
  assert.equal(saved.filter((u) => u.active && u.role === "sahip").length, 1);
  assert.equal(saved.filter((u) => !u.active && u.tokenVersion === 1).length, 1);
  const audit = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.access")));
  assert.equal(audit.length, 1);
});

test("kullanıcı: HQ başka bir HQ hesabının yetkisini kaldıramaz", async () => {
  const { tenant, store, users } = await fixture();
  const result = await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[2].id, {
    userId: users[3].id, role: "mudur", storeId: store.id, active: false,
  }));
  assert.ok(result.error);
  const [saved] = await getDb().select().from(schema.users).where(eq(schema.users.id, users[3].id));
  assert.equal(saved.active, true);
  assert.equal(saved.storeId, null);
  assert.equal(saved.tokenVersion, 0);
});

test("kullanıcı: izinli şube ataması oturumları düşürür; değişmeyen kayıt ve rollback sürümü bozmaz", async () => {
  const { tenant, store, users } = await fixture();
  const input = { userId: users[3].id, role: "mudur", storeId: store.id, active: true };
  assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[0].id, input))).ok);
  // Artık şube müdürü olan hedefi HQ hesabı düzenleyebilir.
  const disabled = { ...input, active: false };
  assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[2].id, disabled))).ok);
  assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[2].id, disabled))).ok);
  await assert.rejects(withTenant(tenant.id, async (tx) => {
    assert.ok((await changeUserAccess(tx, tenant.id, users[0].id, input)).ok);
    throw new Error("rollback-access-test");
  }), /rollback-access-test/);
  const [saved] = await getDb().select().from(schema.users).where(eq(schema.users.id, input.userId));
  assert.equal(saved.storeId, store.id);
  assert.equal(saved.active, false);
  assert.equal(saved.tokenVersion, 2, "yalnız iki gerçek erişim değişikliği oturum sürümünü artırmalı");
  const audit = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.access")));
  assert.equal(audit.length, 3, "geri alınan işlem denetim kaydı bırakmamalı");
});

test("kullanıcı: farklı kiracının aktörü, hedefi ve şubesi erişim değişikliğinde kullanılamaz", async () => {
  const own = await fixture();
  const other = await fixture();
  const input = { userId: own.users[4].id, role: "mudur", storeId: own.store.id, active: false };
  for (const [actorId, change] of [
    [other.users[0].id, input],
    [own.users[0].id, { ...input, userId: other.users[4].id }],
    [own.users[0].id, { ...input, storeId: other.store.id }],
    [own.users[4].id, { ...input, userId: own.users[3].id }],
    [own.users[0].id, { ...input, userId: own.users[0].id }],
  ] as const) {
    const result = await withTenant(own.tenant.id, (tx) => changeUserAccess(tx, own.tenant.id, actorId, change));
    assert.ok(result.error);
  }
  const saved = await getDb().select().from(schema.users).where(inArray(schema.users.tenantId, [own.tenant.id, other.tenant.id]));
  assert.ok(saved.every((u) => u.active && u.tokenVersion === 0));
  const audit = await withTenant(own.tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.access")));
  assert.equal(audit.length, 0);
});
