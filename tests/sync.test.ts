// tests/sync.test.ts — cabukpos_test, uygulama rolü. Eşitleme belgeleri: idempotentlik, inceleme, fiş no, gün sonu.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { backoffMs, formatReceipt } = await import("@/lib/sync/docs");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "SYNC-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "SYNC-T2", vertical: "market" }).returning();
const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  const [ayran] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Ayran", price: 2500, vatRate: 10, active: false }).returning();
  return { store, st, doner, ayran };
});
const other = await withTenant(t2.id, async (tx) => {
  const [st] = await tx.insert(schema.staff).values({ tenantId: t2.id, name: "Yabancı", pinHash: "x" }).returning();
  return { st };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: setup.store.id, name: "Kasa 1", receiptPrefix: "K1" }).returning();
const ctx = { tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, receiptPrefix: "K1" };
const shiftId = crypto.randomUUID();
const now = () => new Date().toISOString();
const sale = (seq: number, over: Record<string, unknown> = {}) => ({
  kind: "sale", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, receiptSeq: seq, at: now(),
  lines: [{ productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 2000 }],
  payments: [{ method: "nakit", amount: 40000 }], ...over,
});
const saleRow = (id: string) => withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id))).then((r) => r[0]);

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});

test("saf: fiş no biçimi, artan bekleme", () => {
  assert.equal(formatReceipt("K1", 42), "K1-000042");
  assert.deepEqual([1, 2, 3, 20].map(backoffMs), [2000, 4000, 8000, 300000]);
});

test("vardiya açma idempotent; başka kiracının personeli reddedilir", async () => {
  const doc = { kind: "shift_open", id: shiftId, staffId: setup.st.id, at: now(), openingCash: 50000 };
  assert.deepEqual(await applyDoc(ctx, doc), { id: shiftId, ok: true });
  assert.deepEqual(await applyDoc(ctx, doc), { id: shiftId, ok: true });
  const n = await withTenant(t.id, (tx) => tx.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)));
  assert.equal(n.length, 1);
  const bad = await applyDoc(ctx, { ...doc, id: crypto.randomUUID(), staffId: other.st.id });
  assert.equal(bad.ok, false);
  assert.equal((await applyDoc(ctx, { kind: "sale", id: "x" })).ok, false);
});

test("satış: istemci anlık görüntüsü, toplam sunucuda; aynı belge ikinci kez tek kayıt; fiş sayacı ilerler", async () => {
  const d = sale(1);
  assert.deepEqual(await applyDoc(ctx, d), { id: d.id, ok: true });
  assert.deepEqual(await applyDoc(ctx, d), { id: d.id, ok: true });
  const r = await saleRow(d.id);
  assert.equal(r.receiptNo, "K1-000001");
  assert.equal(r.total, 36000);
  assert.equal(r.change, 4000);
  assert.equal(r.review, null);
  assert.deepEqual(r.vat, [{ rate: 10, gross: 36000, net: 32727, vat: 3273 }]);
  const lines = await withTenant(t.id, (tx) => tx.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, d.id)));
  assert.equal(lines.length, 1);
  const [dv] = await getDb().select().from(schema.devices).where(eq(schema.devices.id, dev.id));
  assert.equal(dv.nextReceiptNo, 2);
});

test("satış reddedilmez: pasif ürün, fiyat farkı, silinmiş ürün, eksik ödeme, fiş no çakışması → kayıt + review", async () => {
  const d = sale(2, {
    lines: [
      { productId: setup.ayran.id, name: "Ayran", unitPrice: 2500, vatRate: 10, qtyMilli: 1000 },
      { productId: setup.doner.id, name: "Döner", unitPrice: 17000, vatRate: 10, qtyMilli: 1000 },
      { productId: crypto.randomUUID(), name: "Eski ürün", unitPrice: 1000, vatRate: 20, qtyMilli: 1000 },
    ],
    payments: [{ method: "kart", amount: 100 }],
  });
  assert.equal((await applyDoc(ctx, d)).ok, true);
  const r = await saleRow(d.id);
  assert.equal(r.total, 20500);
  assert.match(r.review!, /satıştan kalkmış ürün: Ayran/);
  assert.match(r.review!, /fiyat\/KDV farkı: Döner/);
  assert.match(r.review!, /silinmiş ürün: Eski ürün/);
  assert.match(r.review!, /Eksik ödeme/);
  const dup = sale(1);
  assert.equal((await applyDoc(ctx, dup)).ok, true);
  const rd = await saleRow(dup.id);
  assert.equal(rd.receiptNo, "K1-000001-2");
  assert.match(rd.review!, /fiş no çakıştı/);
});

test("gün sonu: beklenen kasa buluttaki satışlardan; ikinci kapama değiştirmez; bilinmeyen vardiyaya satış reddedilir", async () => {
  const close = { kind: "shift_close", id: shiftId, staffId: setup.st.id, at: now(), countedCash: 60000 };
  assert.equal((await applyDoc(ctx, close)).ok, true);
  assert.equal((await applyDoc(ctx, { ...close, countedCash: 1 })).ok, true);
  const [s] = await withTenant(t.id, (tx) => tx.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)));
  // açılış 500 + nakit (400-40) + (400-40) = 1220 TL; kart satışında nakit yok
  assert.equal(s.expectedCash, 122000);
  assert.equal(s.countedCash, 60000);
  const late = sale(9);
  assert.equal((await applyDoc(ctx, late)).ok, true);
  assert.match((await saleRow(late.id)).review!, /kapanmış vardiya/);
  assert.equal((await applyDoc(ctx, sale(10, { shiftId: crypto.randomUUID() }))).ok, false);
});
