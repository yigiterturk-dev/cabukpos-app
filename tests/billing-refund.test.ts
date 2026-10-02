// tests/billing-refund.test.ts — #15: iade koşulu (saf) + talep/çek/onay akışı (cabukpos_test).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema, withTenant } = await import("@/db");
const { createPayment, completePayment, requestRefund, withdrawRefund, completeRefund, salesSincePayment } = await import("@/lib/billing/service");
const { refundWindowOk, REFUND_WINDOW_DAYS } = await import("@/lib/core/billing");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "IADE-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

const paid = new Date("2026-10-01T12:00:00Z");

test("iade koşulu: 7 gün + satışsız dönem; hata/süre dışı", () => {
  assert.equal(REFUND_WINDOW_DAYS, 7);
  assert.equal(refundWindowOk(paid, new Date(paid.getTime() + 6 * 86400_000), 0), true);
  assert.equal(refundWindowOk(paid, new Date(paid.getTime() + 6 * 86400_000), 1), false);
  assert.equal(refundWindowOk(paid, new Date(paid.getTime() + 8 * 86400_000), 0), false);
});

test("iade akışı: talep → çek → talep → onay; geçersiz geçişler dokunmaz", async () => {
  const p = await createPayment(t.id, "fake", "aylik", 100);
  assert.equal(await requestRefund(p.id, "satissiz", "not"), false); // bekleyen çekime talep açılmaz
  assert.equal(await completePayment(p.id, true, "x"), "odendi");
  assert.equal(await requestRefund(p.id, "satissiz", null), true);
  const afterReq = await getDb().select().from(schema.billingPayments).where(eq(schema.billingPayments.id, p.id));
  assert.equal(afterReq[0].status, "iade_talep");
  assert.equal(afterReq[0].refundReason, "satissiz");
  assert.equal(await withdrawRefund(p.id), true);
  const afterW = await getDb().select().from(schema.billingPayments).where(eq(schema.billingPayments.id, p.id));
  assert.equal(afterW[0].status, "odendi");
  assert.equal(afterW[0].refundReason, null);
  assert.equal(await completeRefund(p.id), false); // onay yalnız talepli çekimde
  assert.equal(await requestRefund(p.id, "hatali", "mükerrer"), true);
  assert.equal(await completeRefund(p.id, "paytr-manuel"), true);
  const done = await getDb().select().from(schema.billingPayments).where(eq(schema.billingPayments.id, p.id));
  assert.equal(done[0].status, "iade");
  assert.ok(done[0].refundedAt);
  assert.equal(done[0].providerRef, "paytr-manuel");
  assert.equal(await completeRefund(p.id), false); // idempotent
  assert.equal(await requestRefund(p.id, "diger", null), false); // iade edilen yeniden talep açılmaz
});

test("satış sayacı: ödeme sonrası satışlar sayılır", async () => {
  await withTenant(t.id, async (tx) => {
    const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "K", pinHash: "x" }).returning({ id: schema.staff.id });
    const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).limit(1);
    const storeId = s?.id ?? (await tx.insert(schema.stores).values({ tenantId: t.id, name: "Ş1" }).returning({ id: schema.stores.id }))[0].id;
    const [d] = await tx.insert(schema.devices).values({ tenantId: t.id, storeId, name: "K1", receiptPrefix: "IA", role: "kasa" }).returning({ id: schema.devices.id });
    const [sh] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId, deviceId: d.id, openedBy: st.id, openingCash: 0 }).returning({ id: schema.shifts.id });
    await tx.insert(schema.sales).values({ id: crypto.randomUUID(), tenantId: t.id, storeId, deviceId: d.id, shiftId: sh.id, staffId: st.id, receiptNo: "R1", total: 100, vat: [] });
  });
  const paidAt = new Date(Date.now() - 1000);
  assert.equal(await salesSincePayment(t.id, paidAt), 1);
  assert.equal(await salesSincePayment(t.id, new Date(Date.now() + 60_000)), 0);
});
