import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { setupRegister } = await import("@/lib/kasa/setup");
const { setupPinProblem } = await import("@/lib/kasa/setup-pin");
const { verifyPin } = await import("@/lib/auth/pin");
const { eq, inArray } = await import("drizzle-orm");
const tenants: string[] = [];
after(async () => {
  if (tenants.length) await getDb().delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  await closeDb();
});
async function fixture() {
  const [tenant] = await getDb().insert(schema.tenants).values({ name: "REGISTER-SETUP", vertical: "market" }).returning();
  tenants.push(tenant.id);
  const stores = await withTenant(tenant.id, tx => tx.insert(schema.stores).values([
    { tenantId: tenant.id, name: "Şube" }, { tenantId: tenant.id, name: "Depo", kind: "depo" },
  ]).returning());
  const actor = { id: crypto.randomUUID(), role: "sahip" as const, storeId: null };
  const input = { name: "Kendi kasam", deviceName: "Kasa 1", pin: "5837", confirmation: "5837", storeId: stores[0].id,
    tokenHash: crypto.randomUUID(), current: null as { id: string; tenantId: string; storeId: string } | null };
  const setup = (changes = {}, user = actor) => withTenant(tenant.id, tx => setupRegister(tx, tenant.id, user, { ...input, ...changes }));
  const records = () => withTenant(tenant.id, async tx => ({ staff: await tx.select().from(schema.staff),
    devices: await tx.select().from(schema.devices).where(eq(schema.devices.tenantId, tenant.id)) }));
  return { tenant, stores, actor, input, setup, records };
}

test("register setup: PIN repeat, weak PIN and malformed input are rejected", () => {
  assert.ok(setupPinProblem("5837", "5838"));
  for (const pin of ["1111", "1234", "6543", "123", "abcdef", "1234567"]) assert.ok(setupPinProblem(pin, pin));
  assert.equal(setupPinProblem("5837", "5837"), null);
});
test("register setup: chosen PIN is hashed; new register is paired only to own sales store", async () => {
  const f = await fixture();
  assert.deepEqual(await f.setup(), { ok: true });
  const saved = await f.records();
  assert.equal(saved.staff.length, 1);
  assert.equal(saved.devices.length, 1);
  assert.equal(saved.staff[0].role, "mudur");
  assert.notEqual(saved.staff[0].pinHash, f.input.pin);
  assert.ok(await verifyPin(f.input.pin, saved.staff[0].pinHash));
  assert.equal(saved.devices[0].storeId, f.stores[0].id);
  assert.equal(saved.devices[0].tokenHash, f.input.tokenHash);
  const current = { id: saved.devices[0].id, tenantId: f.tenant.id, storeId: f.stores[0].id };
  assert.deepEqual(await f.setup({ current }), { ok: true });
  const repeated = await f.records();
  assert.equal(repeated.staff.length, 1);
  assert.equal(repeated.devices.length, 1);
  assert.equal(repeated.staff[0].pinHash, saved.staff[0].pinHash);
});
test("register setup: never overwrites another PIN or creates partial device/staff records", async () => {
  const f = await fixture();
  await f.setup();
  const before = await f.records();
  assert.ok("error" in await f.setup({ pin: "6924", confirmation: "6924" }));
  assert.ok("error" in await f.setup({ name: "Başka kişi" }));
  const after = await f.records();
  assert.equal(after.staff.length, 1);
  assert.equal(after.devices.length, 1);
  assert.equal(after.staff[0].pinHash, before.staff[0].pinHash);
});
test("register setup: depot, foreign store/device, invalid device and branch manager are denied", async () => {
  const f = await fixture(); const other = await fixture();
  assert.ok("error" in await f.setup({ storeId: f.stores[1].id }));
  assert.ok("error" in await f.setup({ storeId: other.stores[0].id }));
  assert.ok("error" in await f.setup({ current: { id: crypto.randomUUID(), tenantId: other.tenant.id, storeId: other.stores[0].id } }));
  assert.ok("error" in await f.setup({ current: { id: crypto.randomUUID(), tenantId: f.tenant.id, storeId: f.stores[0].id } }));
  assert.ok("error" in await withTenant(f.tenant.id, tx => setupRegister(tx, f.tenant.id,
    { ...f.actor, role: "mudur", storeId: f.stores[0].id }, f.input)));
  assert.deepEqual(await f.records(), { staff: [], devices: [] });
});
test("register setup: a revoked device cannot be reused", async () => {
  const f = await fixture();
  await f.setup();
  const saved = await f.records();
  const device = saved.devices[0];
  await getDb().update(schema.devices).set({ revokedAt: new Date() }).where(eq(schema.devices.id, device.id));
  assert.ok("error" in await f.setup({ current: { id: device.id, tenantId: f.tenant.id, storeId: device.storeId } }));
  const after = await f.records();
  assert.equal(after.staff.length, 1);
  assert.equal(after.devices.length, 1);
});
