// tests/billing-db.test.ts — cabukpos_test, uygulama rolü. Deneme varsayılanı + ödeme idempotentliği.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema, withTenant } = await import("@/db");
const { createPayment, completePayment, tenantBilling, tenantUnits } = await import("@/lib/billing/service");
const { issueSubscriptionInvoice } = await import("@/lib/billing/invoice");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "ABONE-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.billingInvoiceCounters);
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("yeni işletme 14 gün deneme", async () => {
  const b = (await tenantBilling(t.id))!;
  const days = (b.trialEndsAt.getTime() - Date.now()) / 86400_000;
  assert.ok(days > 13.9 && days <= 14.01, String(days));
  assert.equal(b.paidUntil, null);
});

test("ödeme: başarısız uzatmaz, başarılı bir kez uzatır", async () => {
  const f = await createPayment(t.id, "fake", "aylik", 100);
  assert.equal(await completePayment(f.id, false, "x"), "basarisiz");
  assert.equal(await completePayment(f.id, true, "x"), "zaten");
  assert.equal((await tenantBilling(t.id))!.paidUntil, null);
  const p = await createPayment(t.id, "fake", "yillik", 1000);
  const rs = await Promise.all([completePayment(p.id, true, "a"), completePayment(p.id, true, "b")]);
  assert.deepEqual(rs.sort(), ["odendi", "zaten"]);
  const b = (await tenantBilling(t.id))!;
  const exp = new Date(b.trialEndsAt);
  exp.setUTCFullYear(exp.getUTCFullYear() + 1);
  assert.equal(b.paidUntil!.toISOString(), exp.toISOString());
});

test("birim sayısı ve ödeme fotoğrafı: şube/terminal ödeme satırına yazılır", async () => {
  const [s] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "MERKEZ" }).returning());
  await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "ŞUBE-2" }));
  await withTenant(t.id, (tx) => tx.insert(schema.devices).values({ tenantId: t.id, storeId: s.id, name: "KASA-1", receiptPrefix: "A" }));
  await withTenant(t.id, (tx) => tx.insert(schema.devices).values({ tenantId: t.id, storeId: s.id, name: "KASA-2", receiptPrefix: "B", revokedAt: new Date() }));
  const u = await tenantUnits(t.id);
  assert.deepEqual(u, { stores: 2, devices: 1 });
  const p = await createPayment(t.id, "fake", "aylik", 60_000, u);
  assert.equal(p.stores, 2);
  assert.equal(p.devices, 1);
});

test("abonelik faturası: ödeme sonrası açılır, sağlayıcı keser, ikinci deneme idempotent", async () => {
  const p = await createPayment(t.id, "fake", "aylik", 50_000, { stores: 1, devices: 1 });
  assert.equal(await completePayment(p.id, true, "ok"), "odendi");
  const [inv] = await getDb().select().from(schema.billingInvoices).where(eq(schema.billingInvoices.paymentId, p.id));
  assert.ok(inv, "fatura kaydı açılmalı");
  assert.equal(inv.status, "pending");
  assert.equal((inv.buyer as { taxId: string }).taxId, "11111111111"); // kiracının vergi bilgisi yok → nihai tüketici
  assert.equal(inv.token.length, 24);
  process.env.SAAS_NAME = "ÇabukPOS";
  process.env.SAAS_TAX_ID = "1234567801";
  process.env.SAAS_ADDRESS = "Test Mah. 1";
  assert.equal(await issueSubscriptionInvoice(inv.id), true);
  const [done] = await getDb().select().from(schema.billingInvoices).where(eq(schema.billingInvoices.paymentId, p.id));
  assert.equal(done.status, "issued");
  assert.match(done.number!, /^CBP\d{4}\d{9}$/);
  assert.ok(done.ettn);
  assert.equal(await issueSubscriptionInvoice(inv.id), false); // zaten kesildi, numara yanmaz
});
