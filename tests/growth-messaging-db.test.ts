// tests/growth-messaging-db.test.ts — #34: onaylı kampanya gönderim akışı (cabukpos_test): izin filtresi, idempotentlik, opt-out sonrası atlama.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { sendGrowthCampaignPage, growthRefSecret } = await import("@/lib/growth/messaging");
const { recipientRef } = await import("@/lib/growth/recipient-ref");
const { and, eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "PKM-T", vertical: "restoran" }).returning();
const secret = growthRefSecret(t.id);
const phones = ["+905552220001", "+905552220002", "+905552220003", "+905552220004"];
const ids: string[] = [];
await withTenant(t.id, async (tx) => {
  for (const [i, phone] of phones.entries()) {
    const [c] = await tx.insert(schema.customers).values({ tenantId: t.id, name: `Müşteri ${i}`, phone, marketingConsent: true, marketingConsentAt: new Date(), marketingConsentSource: "test", lastOrderAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) }).returning();
    ids.push(c.id);
  }
});
// 4. müşteri izin çıkışı yapmış olmalı (opt-out sonrası hedeflenmez)
await withTenant(t.id, (tx) => tx.update(schema.customers).set({ marketingConsent: false, marketingConsentAt: null, marketingConsentSource: "provider_opt_out" }).where(eq(schema.customers.id, ids[3])));
const [camp] = await withTenant(t.id, async (tx) => tx.insert(schema.growthCampaigns).values({ tenantId: t.id, name: "Dönüş", segment: "dormant_30", message: "Sizi özledik!", audienceCount: 3 }).returning());

// Sağlayıcı: aldığı hedefleri sırayla kabul eder; istenirse dış ID'siz (başarısız) döner.
const sentBodies: { ref: string; phone: string }[][] = [];
const provider = { id: "sms", send: async (input: { body: string; targets: { recipientRef: string; phone: string }[] }) => {
  sentBodies.push(input.targets.map((t2) => ({ ref: t2.recipientRef, phone: t2.phone })));
  return input.targets.map((t2, i) => ({ recipientRef: t2.recipientRef, externalId: input.body === "fail" ? null : `m-${sentBodies.length}-${i + 1}` }));
} };

test("onaysız kampanya gönderilmez", async () => {
  const r = await sendGrowthCampaignPage({ tenantId: t.id, campaignId: camp.id, actor: "test", provider });
  assert.deepEqual(r, { error: "not_approved" });
  assert.equal(sentBodies.length, 0);
});

test("sağlayıcı kapalıyken provider_disabled", async () => {
  await withTenant(t.id, (tx) => tx.update(schema.growthCampaigns).set({ approvedAt: new Date(), approvedBy: null }).where(eq(schema.growthCampaigns.id, camp.id)));
  const r = await sendGrowthCampaignPage({ tenantId: t.id, campaignId: camp.id, actor: "test", provider: null });
  assert.deepEqual(r, { error: "provider_disabled" });
});

test("gönderim: yalnız izinliler, sent olayı + ref eşlemesi; tekrar çağrı idempotent", async () => {
  const r1 = await sendGrowthCampaignPage({ tenantId: t.id, campaignId: camp.id, actor: "test", provider });
  assert.deepEqual(r1, { sent: 3, failed: 0, remaining: 0 });
  // yalnız izinli 3 kişi; opt-out'lu 4. yok
  assert.equal(sentBodies[0]?.length, 3);
  assert.ok(!sentBodies[0]?.some((x) => x.phone === phones[3]));
  const events = await withTenant(t.id, (tx) => tx.select({ ref: schema.growthCampaignEvents.recipientRef, ext: schema.growthCampaignEvents.externalId }).from(schema.growthCampaignEvents)
    .where(and(eq(schema.growthCampaignEvents.campaignId, camp.id), eq(schema.growthCampaignEvents.type, "sent"))));
  assert.equal(events.length, 3);
  const refs = new Set((await withTenant(t.id, (tx) => tx.select().from(schema.growthRecipientRefs))).map((r2) => r2.recipientRef));
  for (const phone of phones.slice(0, 3)) assert.ok(refs.has(recipientRef(secret, phone)));
  // ikinci tur: hepsi zaten gönderilmiş → sağlayıcı hiç çağrılmaz
  const before = sentBodies.length;
  const r2 = await sendGrowthCampaignPage({ tenantId: t.id, campaignId: camp.id, actor: "test", provider });
  assert.deepEqual(r2, { sent: 0, failed: 0, remaining: 0 });
  assert.equal(sentBodies.length, before);
});

test("başarısız gönderimler sent olayı yazmaz, failed sayılır", async () => {
  const [camp2] = await withTenant(t.id, async (tx) => {
    const [c2] = await tx.insert(schema.growthCampaigns).values({ tenantId: t.id, name: "Fail", segment: "all_consented", message: "fail", audienceCount: 3 }).returning();
    await tx.update(schema.growthCampaigns).set({ approvedAt: new Date() }).where(eq(schema.growthCampaigns.id, c2.id));
    return [c2];
  });
  const r = await sendGrowthCampaignPage({ tenantId: t.id, campaignId: camp2.id, actor: "test", provider: { id: "sms", send: async (input) => input.targets.map((t2) => ({ recipientRef: t2.recipientRef, externalId: null, error: "kontör yok" })) } });
  assert.deepEqual(r, { sent: 0, failed: 3, remaining: 0 });
  const events = await withTenant(t.id, (tx) => tx.select({ id: schema.growthCampaignEvents.id }).from(schema.growthCampaignEvents).where(eq(schema.growthCampaignEvents.campaignId, camp2.id)));
  assert.equal(events.length, 0);
});

test("olmayan kampanya bulunamadı", async () => {
  const r = await sendGrowthCampaignPage({ tenantId: t.id, campaignId: "00000000-0000-1000-8000-000000000000", actor: "test", provider });
  assert.deepEqual(r, { error: "campaign_not_found" });
});

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});
