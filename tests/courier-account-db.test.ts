import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { courierAccount, courierAccountCsv } = await import("@/lib/admin/courier-account");
const [tenant] = await getDb().insert(schema.tenants).values({ name: "Kurye hesap testi", vertical: "restoran" }).returning();
const [other] = await getDb().insert(schema.tenants).values({ name: "Başka işletme", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, other.id));
  await closeDb();
});
const f = await withTenant(tenant.id, async tx => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
  const [branch] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Diğer" }).returning();
  const [staff] = await tx.insert(schema.staff).values({ tenantId: tenant.id, name: "=HYPERLINK(test)", role: "kurye", pinHash: "!" }).returning();
  const devices = await tx.insert(schema.devices).values([
    { tenantId: tenant.id, storeId: store.id, name: "Kurye telefon", role: "kurye", receiptPrefix: "K1" },
    { tenantId: tenant.id, storeId: store.id, name: "Kasa", role: "kasa", receiptPrefix: "M1" },
    { tenantId: tenant.id, storeId: branch.id, name: "Başka şube telefonu", role: "kurye", receiptPrefix: "B1" },
  ]).returning();
  const shifts: (typeof schema.shifts.$inferSelect)[] = [];
  for (const device of devices) {
    const [shift] = await tx.insert(schema.shifts).values({ tenantId: tenant.id, storeId: device.storeId, deviceId: device.id, openedBy: staff.id, openingCash: 10000, openedAt: new Date("2026-10-23T23:30:00+03:00"), closedAt: new Date("2026-10-24T11:00:00+03:00"), closedBy: staff.id, countedCash: 17500, expectedCash: 18000 }).returning();
    shifts.push(shift);
  }
  const sale = async (shift: typeof shifts[number], at: string, total: number, payments: { method: "nakit" | "kart" | "online"; amount: number }[], change = 0, refund = false, review: string | null = null) => {
    const id = crypto.randomUUID();
    await tx.insert(schema.sales).values({ id, tenantId: tenant.id, storeId: shift.storeId, deviceId: shift.deviceId, shiftId: shift.id, staffId: staff.id, receiptNo: id, channel: "paket", status: refund ? "iade" : "kapandi", total, change, vat: [], createdAt: new Date(at), review });
    await tx.insert(schema.payments).values(payments.map(p => ({ tenantId: tenant.id, saleId: id, ...p })));
  };
  const main = shifts[0];
  await sale(main, "2026-10-23T23:45:00+03:00", 10000, [{ method: "nakit", amount: 10000 }]);
  await sale(main, "2026-10-24T00:00:00+03:00", 15000, [{ method: "nakit", amount: 10000 }, { method: "kart", amount: 10000 }], 5000, false, "Kontrol edin");
  await sale(main, "2026-10-24T01:00:00+03:00", 2000, [{ method: "nakit", amount: 2000 }], 0, true);
  await sale(main, "2026-10-24T02:00:00+03:00", 30000, [{ method: "online", amount: 30000 }]);
  for (const shift of shifts.slice(1)) await sale(shift, "2026-10-24T02:00:00+03:00", 99999, [{ method: "nakit", amount: 99999 }]);
  await tx.insert(schema.registerEvents).values({ id: crypto.randomUUID(), tenantId: tenant.id, storeId: store.id, deviceId: main.deviceId, shiftId: main.id, staffId: staff.id, type: "safe_drop", lines: [], total: 5000, at: new Date("2026-10-24T03:00:00+03:00") });
  return { store, branch, main, staff };
});
const ctx = { tenantId: tenant.id, storeId: f.store.id };

test("kurye hesabı gerçek karma ödemeyi, para üstünü, iadeyi ve gece yarısını ayırır", async () => {
  const report = await courierAccount(ctx, "2026-10-24");
  assert.equal(report.rows.length, 1, "kasa cihazı ve başka şube rapora girmez");
  assert.deepEqual(report.daily.byMethod, { nakit: 3000, kart: 10000, online: 30000, yemek_karti: 0, hediye_karti: 0 });
  assert.equal(report.daily.refundTotal, 2000);
  assert.equal(report.reviewCount, 1, "inceleme bekleyen gerçek tahsilat gizlenmez");
  assert.equal(report.rows[0].summary.expectedCash, 18000, "önceki gün tahsilatı vardiya nakdine dahildir");
  assert.equal(report.rows[0].variance, -500);
  assert.equal(report.rows[0].changedAfterClose, false);
  const prior = await courierAccount(ctx, "2026-10-23");
  assert.equal(prior.daily.byMethod.nakit, 10000);
  assert.equal(prior.daily.byMethod.kart, 0);
});

test("kapanış sonrası eşitlenen kayıt beklenen tutarı değiştirirse yeniden kontrol istenir", async () => {
  await withTenant(tenant.id, tx => tx.update(schema.shifts).set({ expectedCash: 17000 }).where(eq(schema.shifts.id, f.main.id)));
  try {
    const report = await courierAccount(ctx, "2026-10-24");
    assert.equal(report.rows[0].changedAfterClose, true);
    assert.equal(report.rows[0].savedExpected, 17000);
    assert.equal(report.rows[0].variance, -500);
  } finally {
    await withTenant(tenant.id, tx => tx.update(schema.shifts).set({ expectedCash: 18000 }).where(eq(schema.shifts.id, f.main.id)));
  }
});

test("kurye hesabı kiracı ve şube sınırını korur, geçersiz tarihi reddeder", async () => {
  assert.equal((await courierAccount({ tenantId: other.id, storeId: f.store.id }, "2026-10-24")).rows.length, 0);
  assert.equal((await courierAccount({ tenantId: tenant.id, storeId: f.branch.id }, "2026-10-24")).daily.byMethod.nakit, 99999);
  await assert.rejects(courierAccount(ctx, "2026-02-31"), /Geçersiz tarih/);
});

test("kurye hesap CSV'si gerçek tutarları ve farkı dışa aktarır; formül adını etkisizleştirir", async () => {
  const csv = courierAccountCsv(await courierAccount(ctx, "2026-10-24"));
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes("'=HYPERLINK(test)"));
  assert.ok(csv.includes(";30.00;100.00;300.00;180.00;175.00;\'-5.00;"));
});
