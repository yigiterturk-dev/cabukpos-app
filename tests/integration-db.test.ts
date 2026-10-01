// tests/integration-db.test.ts — cabukpos_test, uygulama rolü. M9c: ajans anahtarı + günlük özet sorgusu + uç.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { createKey, findKey, listKeys, revokeKey } = await import("@/lib/integrations/keys");
const { dailyStatsData } = await import("@/lib/admin/report");
const { loadFeaturePack } = await import("@/lib/growth/feature-pack-data");
const { istToday } = await import("@/lib/core/report");
const { GET } = await import("@/app/api/v1/stats/daily/route");
const { recordCampaignEvent } = await import("@/lib/growth/events");
const { createGrowthCampaignDraft } = await import("@/lib/growth/campaigns");
const { loadGrowthCampaignStatus } = await import("@/lib/growth/campaign-status");
const { listGrowthCampaigns } = await import("@/lib/growth/campaign-list");
const { loadGrowthCampaignAudience } = await import("@/lib/growth/audience");
const { approveGrowthCampaign } = await import("@/lib/growth/campaign-approval");
const { eq, like, sql } = await import("drizzle-orm");

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

test("growth feature-pack: tenant özeti PII ve kimlik döndürmez", async () => {
  const before = await loadFeaturePack(t.id, "restoran");
  await withTenant(t2.id, async (tx) => {
    await tx.insert(schema.customers).values({ tenantId: t2.id, phone: "905550000099", name: "Başka kiracı", marketingConsent: true });
    await tx.insert(schema.growthCampaigns).values({ tenantId: t2.id, name: "Başka kampanya", message: "Merhaba" });
  });
  await withTenant(t.id, async (tx) => {
    await tx.insert(schema.growthCampaigns).values({ tenantId: t.id, name: "Arşiv", message: "Eski", status: "arsiv" });
  });
  const p = await loadFeaturePack(t.id, "restoran");
  assert.deepEqual({ customer: p.customer, package90: p.package90, campaigns: p.campaigns }, { customer: before.customer, package90: before.package90, campaigns: before.campaigns });
  assert.equal(p.privacy.pii, false);
  assert.equal("tenantId" in p, false);
  assert.equal("phone" in p, false);
  assert.equal(p.vertical, "restoran");
});

test("growth event intake: tenant sınırı ve externalId idempotency", async () => {
  const [campaign] = await withTenant(t.id, (tx) => tx.insert(schema.growthCampaigns).values({ tenantId: t.id, name: "Geri kazanım", message: "Merhaba", createdBy: null }).returning({ id: schema.growthCampaigns.id }));
  const request = () => withTenant(t.id, (tx) => recordCampaignEvent(tx, { tenantId: t.id, campaignId: campaign.id, type: "converted", externalId: "provider-event-1", amount: 12500, actor: "integration:test" }));
  const first = await request();
  assert.equal("error" in first, false);
  if ("error" in first) return;
  assert.equal(first.duplicate, false);
  if (!first.duplicate) assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await request(), { duplicate: true });
  const otherTenant = await withTenant(t2.id, (tx) => recordCampaignEvent(tx, { tenantId: t2.id, campaignId: campaign.id, type: "sent", externalId: "other-tenant", actor: "integration:test" }));
  assert.deepEqual(otherTenant, { error: "campaign_not_found" });
  const [customer] = await withTenant(t.id, (tx) => tx.insert(schema.customers).values({ tenantId: t.id, phone: "905550000001", name: "Opt-out", marketingConsent: true }).returning({ id: schema.customers.id }));
  const optOut = await withTenant(t.id, (tx) => recordCampaignEvent(tx, { tenantId: t.id, campaignId: campaign.id, type: "opt_out", externalId: "provider-optout-1", customerId: customer.id, actor: "integration:test" }));
  assert.equal("error" in optOut, false);
  const [updatedCustomer] = await withTenant(t.id, (tx) => tx.select({ consent: schema.customers.marketingConsent, source: schema.customers.marketingConsentSource }).from(schema.customers).where(eq(schema.customers.id, customer.id)));
  assert.deepEqual(updatedCustomer, { consent: false, source: "provider_opt_out" });
  const [count] = await withTenant(t.id, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(schema.growthCampaignEvents).where(eq(schema.growthCampaignEvents.campaignId, campaign.id)));
  assert.equal(count.n, 2);
  const status = await withTenant(t.id, (tx) => loadGrowthCampaignStatus(tx, { tenantId: t.id, campaignId: campaign.id, actor: "integration:test" }));
  assert.equal(status?.campaign.id, campaign.id);
  assert.equal(status?.metrics.converted, 1);
  assert.equal(status?.metrics.optOut, 1);
  assert.equal(status?.metrics.revenue, 12500);
  assert.equal(await withTenant(t2.id, (tx) => loadGrowthCampaignStatus(tx, { tenantId: t2.id, campaignId: campaign.id, actor: "integration:test" })), null);
  const listed = await withTenant(t.id, (tx) => listGrowthCampaigns(tx, { tenantId: t.id, actor: "integration:test" }));
  assert.equal(listed.find((item) => item.id === campaign.id)?.metrics.revenue, 12500);
  assert.equal("name" in (listed.find((item) => item.id === campaign.id) ?? {}), false);
  assert.equal("message" in (listed.find((item) => item.id === campaign.id) ?? {}), false);
  assert.equal((await withTenant(t2.id, (tx) => listGrowthCampaigns(tx, { tenantId: t2.id, actor: "integration:test" }))).some((item) => item.id === campaign.id), false);
});

test("growth campaign draft: yalnız izinli hedefleri tenant içinde sayar", async () => {
  await withTenant(t.id, (tx) => tx.insert(schema.customers).values({ tenantId: t.id, phone: "905550000002", name: "İzinli hedef", marketingConsent: true, lastOrderAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }));
  const draft = await withTenant(t.id, (tx) => createGrowthCampaignDraft(tx, { tenantId: t.id, name: "Geri kazanım", message: "Sizi özledik", segment: "dormant_30", actor: "integration:test" }));
  assert.equal(draft.audienceCount, 1);
  const [row] = await withTenant(t.id, (tx) => tx.select({ status: schema.growthCampaigns.status, channel: schema.growthCampaigns.channel }).from(schema.growthCampaigns).where(eq(schema.growthCampaigns.id, draft.id)));
  assert.deepEqual(row, { status: "taslak", channel: "manual" });
  const pendingAudience = await withTenant(t.id, (tx) => loadGrowthCampaignAudience(tx, { tenantId: t.id, campaignId: draft.id, secret: "test-growth-key", limit: 1, actor: "integration:test" }));
  assert.deepEqual(pendingAudience, { error: "campaign_not_approved" });
  const [owner] = await withTenant(t.id, (tx) => tx.insert(schema.users).values({ tenantId: t.id, email: "growth-owner-" + crypto.randomUUID() + "@test", name: "Growth Owner", passwordHash: "x" }).returning({ id: schema.users.id }));
  assert.ok(await withTenant(t.id, (tx) => approveGrowthCampaign(tx, { tenantId: t.id, campaignId: draft.id, approvedBy: owner.id, actor: "user:" + owner.id })));
  assert.equal(await withTenant(t.id, (tx) => approveGrowthCampaign(tx, { tenantId: t.id, campaignId: draft.id, approvedBy: owner.id, actor: "user:" + owner.id })), null);
  const audience = await withTenant(t.id, (tx) => loadGrowthCampaignAudience(tx, { tenantId: t.id, campaignId: draft.id, secret: "test-growth-key", limit: 1, actor: "integration:test" }));
  assert.equal("error" in (audience ?? {}), false);
  if (audience && !("error" in audience)) {
    assert.equal(audience.recipients.length, 1);
    assert.match(audience.recipients[0].recipientRef, /^hmac-sha256:[a-f0-9]{64}$/);
    assert.equal("phone" in audience.recipients[0], false);
  }
  assert.equal(await withTenant(t2.id, (tx) => loadGrowthCampaignAudience(tx, { tenantId: t2.id, campaignId: draft.id, secret: "other-key", actor: "integration:test" })), null);
});
