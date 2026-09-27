// tests/sale.test.ts — cabukpos_test, uygulama rolü.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { recordSale } = await import("@/lib/kasa/sale");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "SATIS-T", vertical: "restoran" }).returning();
const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  const [ayran] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Ayran", price: 2500, vatRate: 10, active: false }).returning();
  return { store, st, doner, ayran };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: setup.store.id, name: "Kasa 1", receiptPrefix: "K1" }).returning();
await withTenant(t.id, (tx) => tx.insert(schema.shifts).values({ tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, openedBy: setup.st.id, openingCash: 50000 }));
const ctx = { tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, staffId: setup.st.id, receiptPrefix: "K1" };

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("satış: sunucu fiyatı, fiş no, para üstü; aynı id ikinci kez yeni kayıt/fiş no üretmez", async () => {
  const id = crypto.randomUUID();
  const input = { id, lines: [{ productId: setup.doner.id, qtyMilli: 2000 }], payments: [{ method: "nakit" as const, amount: 40000 }] };
  const r1 = await recordSale(ctx, input);
  assert.deepEqual(r1, { ok: true, saleId: id, receiptNo: "K1-000001", change: 4000 });
  const r2 = await recordSale(ctx, input);
  assert.deepEqual(r2, r1);
  const [row] = await withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id)));
  assert.equal(row.total, 36000);
  assert.deepEqual(row.vat, [{ rate: 10, gross: 36000, net: 32727, vat: 3273 }]);
  const [d] = await getDb().select().from(schema.devices).where(eq(schema.devices.id, dev.id));
  assert.equal(d.nextReceiptNo, 2);
});

test("satış: pasif ürün, eksik ödeme, boş sepet, açık vardiya yok → hata, fiş no ilerlemez", async () => {
  const mk = (lines: { productId: string; qtyMilli: number }[], amount: number) => ({ id: crypto.randomUUID(), lines, payments: [{ method: "kart" as const, amount }] });
  assert.match((await recordSale(ctx, mk([{ productId: setup.ayran.id, qtyMilli: 1000 }], 2500)) as { error: string }).error, /satıştan kalk/);
  assert.match((await recordSale(ctx, mk([{ productId: setup.doner.id, qtyMilli: 1000 }], 100)) as { error: string }).error, /Eksik ödeme/);
  assert.match((await recordSale(ctx, mk([], 0)) as { error: string }).error, /Sepet boş/);
  await withTenant(t.id, (tx) => tx.update(schema.shifts).set({ closedAt: new Date() }).where(eq(schema.shifts.deviceId, dev.id)));
  assert.match((await recordSale(ctx, mk([{ productId: setup.doner.id, qtyMilli: 1000 }], 18000)) as { error: string }).error, /vardiya/);
  const [d] = await getDb().select().from(schema.devices).where(eq(schema.devices.id, dev.id));
  assert.equal(d.nextReceiptNo, 2);
});
