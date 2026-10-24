import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyPasswordReset } = await import("@/lib/auth/reset-password");
const { resetToken, checkReset } = await import("@/lib/auth/reset");
const { eq, sql } = await import("drizzle-orm");
const [tenant] = await getDb().insert(schema.tenants).values({ name: "RESET-RACE-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await closeDb();
});
async function fixture() {
  const [user] = await getDb().insert(schema.users).values({ tenantId: tenant.id, name: "Reset Test", email: `${crypto.randomUUID()}@example.test`, passwordHash: "original-test-hash" }).returning();
  return { user, token: await resetToken(user) };
}

test("şifre yenileme: aynı bağlantının eşzamanlı iki kullanımından yalnız biri başarılı", { timeout: 10000 }, async () => {
  const { user, token } = await fixture();
  let release!: () => void;
  let ready!: () => void;
  const held = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const blocker = getDb().transaction(async (tx) => {
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, user.id)).for("update");
    ready();
    await gate;
  });
  await Promise.race([held, blocker]);
  const pids: number[] = [];
  const resets = ["password-one", "password-two"].map((hash) => getDb().transaction(async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pids.push(connection.pid);
    return applyPasswordReset(tx, token, hash);
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
    assert.ok(waiting, "iki yenileme isteği de kullanıcı kilidini beklemeli");
  } finally {
    release();
    await Promise.all([blocker, ...resets]);
  }
  const results = await Promise.all(resets);
  assert.equal(results.filter(Boolean).length, 1);
  const [saved] = await getDb().select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.equal(saved.tokenVersion, 1);
  assert.equal(saved.passwordHash, results[0] ? "password-one" : "password-two");
  const events = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `user:${user.id}`)));
  assert.equal(events.length, 1);
});

test("şifre yenileme: erişim sürümü değişmiş davet reddedilir", async () => {
  const { user, token } = await fixture();
  await getDb().update(schema.users).set({ tokenVersion: 1 }).where(eq(schema.users.id, user.id));
  assert.equal(await getDb().transaction((tx) => applyPasswordReset(tx, token, "new-password")), null);
  const [saved] = await getDb().select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.equal(saved.passwordHash, user.passwordHash);
  assert.equal(saved.tokenVersion, 1);
});

test("şifre yenileme: doğrulamadan sonra değişen erişim sürümü de kaydı engeller", { timeout: 10000 }, async () => {
  const { user, token } = await fixture();
  let release!: () => void;
  let ready!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const held = new Promise<void>((resolve) => { ready = resolve; });
  const changing = getDb().transaction(async (tx) => {
    await tx.update(schema.users).set({ tokenVersion: 1 }).where(eq(schema.users.id, user.id));
    ready();
    await gate;
  });
  await Promise.race([held, changing]);
  let pid = 0;
  const resetting = getDb().transaction(async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    pid = connection.pid;
    return applyPasswordReset(tx, token, "stale-password");
  });
  try {
    let waiting = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [state] = await getDb().execute<{ waiting: boolean }>(sql`select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = ${pid}`);
      if (state?.waiting) { waiting = true; break; }
      await delay(10);
    }
    assert.ok(waiting, "yenileme doğrulamayı geçip erişim değişikliğinin kilidini beklemeli");
  } finally {
    release();
    await Promise.all([changing, resetting]);
  }
  assert.equal(await resetting, null);
  const [saved] = await getDb().select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.equal(saved.passwordHash, user.passwordHash);
  assert.equal(saved.tokenVersion, 1);
});

test("şifre yenileme: rollback şifreyi, oturum sürümünü ve bağlantıyı birlikte korur", async () => {
  const { user, token } = await fixture();
  await assert.rejects(getDb().transaction(async (tx) => {
    assert.ok(await applyPasswordReset(tx, token, "rolled-back-password"));
    throw new Error("reset-rollback-test");
  }), /reset-rollback-test/);
  const [saved] = await getDb().select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.equal(saved.passwordHash, user.passwordHash);
  assert.equal(saved.tokenVersion, 0);
  assert.equal(await checkReset(token, async () => saved), user.id);
  const events = await withTenant(tenant.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `user:${user.id}`)));
  assert.equal(events.length, 0);
});
