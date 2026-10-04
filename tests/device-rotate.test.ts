// tests/device-rotate.test.ts — #8: cz_device jeton rotasyonu (vade, önceki jeton geçişi, iptal).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { rotateDeviceTokenDb } = await import("@/lib/auth/kasa");
const { sha256 } = await import("@/lib/auth/tokens");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

test("rotasyon: vade dolmadıysa dokunmaz, dolduğunda çevirir; eski jeton önceki olarak geçerli kalır", async () => {
  const [t] = await getDb().insert(schema.tenants).values({ name: "ROT", vertical: "market" }).returning();
  made.push(t.id);
  const [st] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "S" }).returning());
  const old = "eski-jeton";
  const [dv] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: st.id, name: "K", receiptPrefix: "R1", tokenHash: await sha256(old), tokenRotatedAt: new Date() }).returning();

  assert.equal(await rotateDeviceTokenDb(dv.id), null); // vade dolmadı
  const [same] = await getDb().select({ h: schema.devices.tokenHash, p: schema.devices.prevTokenHash }).from(schema.devices).where(eq(schema.devices.id, dv.id));
  assert.equal(same.h, await sha256(old));
  assert.equal(same.p, null);

  await getDb().update(schema.devices).set({ tokenRotatedAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(schema.devices.id, dv.id));
  const fresh = await rotateDeviceTokenDb(dv.id);
  assert.ok(fresh);
  const [rot] = await getDb().select({ h: schema.devices.tokenHash, p: schema.devices.prevTokenHash }).from(schema.devices).where(eq(schema.devices.id, dv.id));
  assert.equal(rot.h, await sha256(fresh!));
  assert.equal(rot.p, await sha256(old)); // eski jeton yeni yazılana dek geçerli

  await getDb().update(schema.devices).set({ tokenRotatedAt: null }).where(eq(schema.devices.id, dv.id));
  const first = await rotateDeviceTokenDb(dv.id); // rotasyonu hiç görmediği cihazlar (null) hemen çevrilir
  assert.ok(first);
  const [again] = await getDb().select({ p: schema.devices.prevTokenHash }).from(schema.devices).where(eq(schema.devices.id, dv.id));
  assert.equal(again.p, await sha256(fresh!));
});
