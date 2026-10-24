import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { createManagedUser } = await import("@/lib/admin/user-create");
const { changeUserAccess } = await import("@/lib/admin/user-access");
const { eq, inArray, sql } = await import("drizzle-orm");
const tenants: string[] = [];
after(async () => {
  if (tenants.length) await getDb().delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  await closeDb();
});
const input = () => ({ name: "Yeni kullanıcı", email: `${crypto.randomUUID()}@example.test`, role: "sahip", storeId: null as string | null, passwordHash: "test-only-hash" });
async function fixture() {
  const [tenant] = await getDb().insert(schema.tenants).values({ name: "CREATE-USER-T", vertical: "market" }).returning();
  tenants.push(tenant.id);
  return withTenant(tenant.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
    const users = await tx.insert(schema.users).values([0, 1].map((i) => ({ tenantId: tenant.id, name: `Sahip ${i}`, email: `${crypto.randomUUID()}@example.test`, passwordHash: "test-only-hash" }))).returning();
    return { tenant, store, users };
  });
}

test("kullanıcı açma: pasifleştirilmiş aktör eski istek bilgisiyle yeni sahip açamaz", async () => {
  const { tenant, users } = await fixture();
  assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[0].id, { userId: users[1].id, role: "sahip", storeId: null, active: false }))).ok);
  const result = await withTenant(tenant.id, (tx) => createManagedUser(tx, tenant.id, users[1], input()));
  assert.ok("error" in result);
  const saved = await getDb().select().from(schema.users).where(eq(schema.users.tenantId, tenant.id));
  assert.equal(saved.length, 2);
});

test("kullanıcı açma: şubeye indirgenen aktör eski sahip yetkisini kullanamaz", async () => {
  const { tenant, store, users } = await fixture();
  assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[0].id, { userId: users[1].id, role: "mudur", storeId: store.id, active: true }))).ok);
  const result = await withTenant(tenant.id, (tx) => createManagedUser(tx, tenant.id, users[1], input()));
  assert.ok("error" in result);
});

test("kullanıcı açma: devam eden pasifleştirmeyi bekler ve güncel yetkiyle reddedilir", { timeout: 10000 }, async () => {
  const { tenant, users } = await fixture();
  let ready!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const disabling = withTenant(tenant.id, async (tx) => {
    assert.ok((await changeUserAccess(tx, tenant.id, users[0].id, { userId: users[1].id, role: "sahip", storeId: null, active: false })).ok);
    ready();
    await gate;
  });
  await Promise.race([held, disabling]);
  let pid = 0;
  const creating = withTenant(tenant.id, async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pid = connection.pid;
    return createManagedUser(tx, tenant.id, users[1], input());
  });
  try {
    let waiting = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [state] = await getDb().execute<{ waiting: boolean }>(sql`select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = ${pid}`);
      if (state?.waiting) { waiting = true; break; }
      await delay(10);
    }
    assert.ok(waiting, "hesap açma erişim değişikliğinin kilidini beklemeli");
  } finally {
    release();
    await Promise.all([disabling, creating]);
  }
  assert.ok("error" in await creating);
});

test("kullanıcı açma: aktör ve şube başka kiracıdan alınamaz", async () => {
  const own = await fixture();
  const other = await fixture();
  assert.ok("error" in await withTenant(own.tenant.id, (tx) => createManagedUser(tx, own.tenant.id, other.users[0], input())));
  assert.ok("error" in await withTenant(own.tenant.id, (tx) => createManagedUser(tx, own.tenant.id, own.users[0], { ...input(), role: "mudur", storeId: other.store.id })));
});

test("kullanıcı açma: aynı e-postayla eşzamanlı istekte tek hesap ve tek denetim kaydı", async () => {
  const { tenant, users } = await fixture();
  const data = input();
  const results = await Promise.all([0, 1].map(() => withTenant(tenant.id, (tx) => createManagedUser(tx, tenant.id, users[0], data))));
  assert.equal(results.filter((r) => "user" in r).length, 1);
  const failure = results.find((r) => "error" in r);
  assert.equal(failure?.field, "email");
  const events = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.create")));
  assert.equal(events.length, 1);
});

test("kullanıcı açma: HQ yalnız şube müdürü açar; işlem geri alınınca hesap ve denetim kaydı kalmaz", async () => {
  const { tenant, store, users } = await fixture();
  assert.ok((await withTenant(tenant.id, (tx) => changeUserAccess(tx, tenant.id, users[0].id, { userId: users[1].id, role: "mudur", storeId: null, active: true }))).ok);
  const [hq] = await getDb().select().from(schema.users).where(eq(schema.users.id, users[1].id));
  assert.ok("error" in await withTenant(tenant.id, (tx) => createManagedUser(tx, tenant.id, hq, input())));
  const branch = { ...input(), role: "mudur", storeId: store.id };
  await assert.rejects(withTenant(tenant.id, async (tx) => {
    assert.ok("user" in await createManagedUser(tx, tenant.id, hq, branch));
    throw new Error("create-user-rollback-test");
  }), /create-user-rollback-test/);
  assert.equal((await getDb().select().from(schema.users).where(eq(schema.users.email, branch.email))).length, 0);
  const events = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.create")));
  assert.equal(events.length, 0);
  const result = await withTenant(tenant.id, (tx) => createManagedUser(tx, tenant.id, hq, branch));
  assert.ok("user" in result);
});
