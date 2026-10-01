// tests/integration-db.test.ts — cabukpos_test, uygulama rolü. M9c: ajans anahtarı + günlük özet sorgusu + uç.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { createKey, findKey, listKeys, revokeKey } = await import("@/lib/integrations/keys");
const { dailyStatsData } = await import("@/lib/admin/report");
const { istToday } = await import("@/lib/core/report");
const { GET } = await import("@/app/api/v1/stats/daily/route");
const { eq, like } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "M9C-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "M9C-T2", vertical: "restoran" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [ali] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  return { store, ali, mudur, doner };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kasa 1", receiptPrefix: "C1" }).returning();
const ctx = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, receiptPrefix: "C1" };
const shiftId = crypto.randomUUID();
const at = new Date().toISOString();
const ok = async (doc: Record<string, unknown>) => assert.equal((await applyDoc(ctx, doc)).ok, true);
const line = { productId: s.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000 };
await ok({ kind: "shift_open", id: shiftId, staffId: s.ali.id, at, openingCash: 0 });
const kasaSale = crypto.randomUUID();
await ok({ kind: "sale", id: kasaSale, shiftId, staffId: s.ali.id, receiptSeq: 1, at, lines: [line], payments: [{ method: "kart", amount: 18000 }] });
// Masa adisyonu iki parça + platform satışı ve onun iadesi: doğrudan satır (adisyon kuralları tab-db testinde)
const vat = [{ rate: 10, gross: 9000, net: 8182, vat: 818 }];
const base = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, shiftId, staffId: s.ali.id, vat };
const tab = crypto.randomUUID(), platformSale = crypto.randomUUID();
await withTenant(t.id, (tx) => tx.insert(schema.sales).values([
  { ...base, id: crypto.randomUUID(), receiptNo: "C1-900001", channel: "masa", total: 9000, tabId: tab },
  { ...base, id: crypto.randomUUID(), receiptNo: "C1-900002", channel: "masa", total: 9000, tabId: tab },
  { ...base, id: platformSale, receiptNo: "C1-900003", channel: "platform", total: 30000, tabId: crypto.randomUUID() },
  { ...base, id: crypto.randomUUID(), receiptNo: "C1-900004", channel: "kasa", status: "iade", total: 30000, refundOf: platformSale },
]));
// Kasa satışının iadesi (sayılır)
await ok({ kind: "refund", id: crypto.randomUUID(), shiftId, staffId: s.ali.id, approvedBy: s.mudur.id, refundOf: kasaSale, receiptSeq: 2, at, lines: [line], payments: [{ method: "kart", amount: 18000 }] });
const today = istToday();

const call = (key: string | null, q = `from=${today}&to=${today}`) =>
  GET(new Request(`http://x/api/v1/stats/daily?${q}`, key ? { headers: { authorization: `Bearer ${key}` } } : {}));

after(async () => {
  await getDb().delete(schema.loginAttempts).where(like(schema.loginAttempts.key, "apikey:%"));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});

test("dailyStatsData: masa parçaları tek sipariş, kasa iadesi düşer, platform ve iadesi hariç", async () => {
  const d = await withTenant(t.id, (tx) => dailyStatsData(tx, { bas: today, bit: today }));
  assert.deepEqual(d, [{ day: today, orderCount: 2, cancelledCount: 1, grossRevenue: 180, channels: { masa: 1, paket: 0, kasa: 1 } }]);
});

test("anahtar: üret → bul (son kullanım yazılır) → listede önek → iptal → bulunmaz", async () => {
  const k = await createKey(t.id, "Zirve Ajans");
  assert.match(k.key, /^cpk_[A-Za-z0-9_-]{43}$/);
  const f = await findKey(k.key);
  assert.deepEqual(f, { id: k.id, tenantId: t.id, tenantName: "M9C-T", scope: "stats" });
  const [l] = await listKeys(t.id);
  assert.equal(l.prefix, k.key.slice(0, 8));
  assert.ok(l.lastUsedAt);
  assert.equal(await revokeKey(t2.id, k.id), false); // başka kiracı iptal edemez
  assert.equal(await revokeKey(t.id, k.id), true);
  assert.equal(await findKey(k.key), null);
  assert.equal(await findKey("cpk_yok"), null);
  assert.equal(await findKey("rastgele"), null);
});

test("uç: 401 / 400 / 200 ve kiracı ayrımı", async () => {
  assert.equal((await call(null)).status, 401);
  assert.equal((await call("cpk_uydurma")).status, 401);
  const k = await createKey(t.id, "Ajans");
  const k2 = await createKey(t2.id, "Başka ajans");
  assert.equal((await call(k.key, `from=${today}&to=2020-01-01`)).status, 400);
  const r = await call(k.key);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.business.name, "M9C-T");
  assert.equal(body.days[0].orderCount, 2);
  const r2 = await (await call(k2.key)).json();
  assert.deepEqual(r2, { business: { name: "M9C-T2" }, days: [] });
  const g = await createKey(t.id, "Laya", "growth");
  assert.equal((await findKey(g.key))?.scope, "growth");
});

test("uç: anahtar başına dakikada 60 istek → 429", async () => {
  const k = await createKey(t.id, "Hızlı ajans");
  await getDb().insert(schema.loginAttempts).values({ key: `apikey:${k.id}`, n: 60 });
  assert.equal((await call(k.key)).status, 429);
});
