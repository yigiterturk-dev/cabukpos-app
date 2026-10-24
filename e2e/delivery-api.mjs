// Local-only HTTP smoke test. Creates and removes its own tenant; never touches demo orders/PINs.
import assert from "node:assert/strict";
import { getDb, schema, withTenant, closeDb } from "../db/index.ts";
import { hashPin } from "../lib/auth/pin.ts";
import { newDeviceToken, sha256 } from "../lib/auth/tokens.ts";
import { signJwt } from "../lib/auth/jwt.ts";
import { eq } from "drizzle-orm";

const base = process.env.BASE ?? "http://127.0.0.1:3811";
const dbUrl = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(dbUrl.hostname) && dbUrl.pathname.startsWith("/cabukpos_preview_"), "Local demo database required");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname) && new URL(base).protocol === "http:", "Local HTTP server required");
const [tenant] = await getDb().insert(schema.tenants).values({ name: "Disposable delivery API smoke", vertical: "restoran" }).returning();
const secret = "test-only-webhook-secret";
const pin = "563812";
try {
  const fixture = await withTenant(tenant.id, async tx => {
    const [store, other] = await tx.insert(schema.stores).values([{ tenantId: tenant.id, name: "A" }, { tenantId: tenant.id, name: "B" }]).returning();
    const [staff] = await tx.insert(schema.staff).values({ tenantId: tenant.id, name: "Test courier", role: "kurye", pinHash: await hashPin(pin) }).returning();
    await tx.insert(schema.platformConnections).values({ tenantId: tenant.id, storeId: store.id, platform: "mock", active: false, autoAccept: true, credentials: secret, webhookSecret: secret });
    const tokens = [newDeviceToken(), newDeviceToken(), newDeviceToken()];
    const devices = [];
    for (const [i, role] of ["kasa", "kurye", "kasa"].entries()) devices.push((await tx.insert(schema.devices).values({ tenantId: tenant.id, storeId: i === 2 ? other.id : store.id, role, name: `Test ${i}`, receiptPrefix: `D${i}`, tokenHash: await sha256(tokens[i]) }).returning())[0]);
    return { store, other, staff, devices, tokens };
  });
  const request = async (path, deviceIndex = null, method = "GET", body, proof) => {
    const headers = { Origin: new URL(base).origin };
    if (deviceIndex !== null) headers.Cookie = `cz_device=${fixture.tokens[deviceIndex]}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (proof) headers.Authorization = `Bearer ${proof}`;
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request("/api/delivery/history?day=2026-10-24")).status, 401);
  assert.equal((await request("/api/delivery/history?day=2026-10-24", 1)).status, 403);
  assert.equal((await request("/api/delivery/history?day=2026-02-30", 0)).status, 400);
  assert.equal((await request("/api/delivery/history?day=2026-10-24", 0)).status, 200);
  const config = await request("/api/delivery/connections", 0);
  assert.equal(config.status, 200); assert.equal(config.body.connections.length, 1);
  assert.equal(JSON.stringify(config.body).includes(secret), false);
  assert.equal((await request("/api/delivery/connections", 2)).body.connections.length, 0);
  assert.equal((await request("/api/delivery/location", 1)).status, 403);
  assert.equal((await request("/api/delivery/location/session", 0, "POST", { staffId: fixture.staff.id, pin })).status, 403);
  assert.equal((await request("/api/delivery/location/session", 1, "POST", { staffId: fixture.staff.id, pin: "111111" })).status, 403);
  const session = await request("/api/delivery/location/session", 1, "POST", { staffId: fixture.staff.id, pin });
  assert.equal(session.status, 200, session.body.error);
  const proof = session.body.token;
  const point = () => ({ latitude: 41.01, longitude: 29.02, accuracy: 12, timestamp: Date.now() });
  assert.equal((await request("/api/delivery/location", 1, "POST", point())).status, 403);
  assert.equal((await request("/api/delivery/location", 0, "POST", point(), proof)).status, 403);
  const wrongPurpose = await signJwt("onay", { sub: fixture.staff.id, tid: tenant.id, did: fixture.devices[1].id }, 60);
  assert.equal((await request("/api/delivery/location", 1, "POST", point(), wrongPurpose)).status, 403);
  assert.equal((await request("/api/delivery/location", 1, "POST", point(), proof)).status, 200);
  assert.equal((await request("/api/delivery/location", 0)).body.positions.length, 1);
  assert.equal((await request("/api/delivery/location", 2)).body.positions.length, 0);
  assert.equal((await request("/api/delivery/location", 1, "DELETE", undefined, proof)).status, 200);
  assert.equal((await request("/api/delivery/location", 1, "POST", point(), proof)).status, 400);
  assert.equal((await request("/api/delivery/location", 0)).body.positions.length, 0);
  console.log("Delivery API smoke OK: role, PIN, token purpose, branch isolation, safe status, stop/replay.");
} finally {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await closeDb();
}
