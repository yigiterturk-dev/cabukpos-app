import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.APP_URL = "https://cabukpos.test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { issueUserInvite } = await import("@/lib/admin/user-invite");
const { changeUserAccess } = await import("@/lib/admin/user-access");
const { checkReset } = await import("@/lib/auth/reset");
const { eq, inArray, sql } = await import("drizzle-orm");
const tenants: string[] = [];
after(async () => {
  if (tenants.length) await getDb().delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  await closeDb();
});
async function fixture() {
  const [tenant] = await getDb().insert(schema.tenants).values({ name: "INVITE-T", vertical: "market" }).returning();
  tenants.push(tenant.id);
  return withTenant(tenant.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
    const users = await tx.insert(schema.users).values(["sahip", "mudur", "mudur"].map((role, i) => ({
      tenantId: tenant.id, name: `Davet ${i}`, email: `${crypto.randomUUID()}@example.test`, passwordHash: "test-only-hash",
      role: role as "sahip" | "mudur", storeId: i === 2 ? store.id : null,
    }))).returning();
    return { tenant, store, users };
  });
}

test("davet: pasifleştirilen veya şubeye indirgenen aktör eski yetkiyle bağlantı üretemez", async () => {
  for (const active of [false, true]) {
    const { tenant, store, users } = await fixture();
    assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[0].id, {
      userId: users[1].id, role: "mudur", storeId: active ? store.id : null, active,
    }))).ok);
    const result = await withTenant(tenant.id, (tx) => issueUserInvite(tx, tenant.id, users[1], users[2].id));
    assert.ok("error" in result);
    const events = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.invite")));
    assert.equal(events.length, 0);
  }
});

test("davet: aktör, hedef ve aktif hesap sınırları korunur; HQ yalnız şube müdürüne davet üretir", async () => {
  const own = await fixture();
  const other = await fixture();
  for (const [actor, userId] of [
    [other.users[0], own.users[2].id],
    [own.users[0], other.users[2].id],
    [own.users[1], own.users[0].id],
    [own.users[1], own.users[1].id],
    [own.users[2], own.users[1].id],
  ] as const) assert.ok("error" in await withTenant(own.tenant.id, (tx) => issueUserInvite(tx, own.tenant.id, actor, userId)));
  const result = await withTenant(own.tenant.id, (tx) => issueUserInvite(tx, own.tenant.id, own.users[1], own.users[2].id));
  assert.ok(result.invite);
  const token = new URL(result.invite.link).searchParams.get("t")!;
  assert.equal(await checkReset(token, async () => own.users[2]), own.users[2].id);
  assert.ok((await withTenant(own.tenant.id, (tx) => changeUserAccess(tx, own.tenant.id, own.users[0].id, {
    userId: own.users[2].id, role: "mudur", storeId: own.store.id, active: false,
  }))).ok);
  assert.ok("error" in await withTenant(own.tenant.id, (tx) => issueUserInvite(tx, own.tenant.id, own.users[0], own.users[2].id)));
});

test("davet: hedef HQ'ya yükseltilirken bekleyen HQ isteği yeni role göre reddedilir", { timeout: 10000 }, async () => {
  const { tenant, users } = await fixture();
  let ready!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const promoting = withTenant(tenant.id, async (tx) => {
    assert.ok((await changeUserAccess(tx, tenant.id, users[0].id, { userId: users[2].id, role: "mudur", storeId: null, active: true })).ok);
    ready();
    await gate;
  });
  await Promise.race([held, promoting]);
  let pid = 0;
  const inviting = withTenant(tenant.id, async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pid = connection.pid;
    return issueUserInvite(tx, tenant.id, users[1], users[2].id);
  });
  try {
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      const [state] = await getDb().execute<{ waiting: boolean }>(sql`select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = ${pid}`);
      if (state?.waiting) { waiting = true; break; }
      await delay(10);
    }
    assert.ok(waiting, "davet isteği rol değişikliğini beklemeli");
  } finally {
    release();
    await Promise.all([promoting, inviting]);
  }
  assert.ok("error" in await inviting);
});

test("davet: denetim kaydı geri alınan işlemde kalmaz", async () => {
  const { tenant, users } = await fixture();
  await assert.rejects(withTenant(tenant.id, async (tx) => {
    assert.ok("invite" in await issueUserInvite(tx, tenant.id, users[0], users[2].id));
    throw new Error("invite-rollback-test");
  }), /invite-rollback-test/);
  const events = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.invite")));
  assert.equal(events.length, 0);
});
