// tests/sync.test.ts — cabukpos_test, uygulama rolü. Eşitleme belgeleri: idempotentlik, inceleme, fiş no, gün sonu.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { backoffMs, formatReceipt, normalizeReceiptNo } = await import("@/lib/sync/docs");
const { lookupSale } = await import("@/lib/sync/lookup");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "SYNC-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "SYNC-T2", vertical: "market" }).returning();
const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  const [ayran] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Ayran", price: 2500, vatRate: 10, active: false }).returning();
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [un] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Un", price: 4000, vatRate: 1, trackStock: true }).returning();
  return { store, st, doner, ayran, mudur, un };
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
  assert.equal(normalizeReceiptNo(" k1-42 "), "K1-000042");
  assert.equal(normalizeReceiptNo("K1-000042-2"), "K1-000042-2");
  assert.equal(normalizeReceiptNo("42"), null);
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

test("safe drop: register_events'e yazılır, idempotent, beklenen kasadan düşülür (#48)", async () => {
  const shift3 = crypto.randomUUID();
  assert.equal((await applyDoc(ctx, { kind: "shift_open", id: shift3, staffId: setup.st.id, at: now(), openingCash: 10000 })).ok, true);
  const drop = { kind: "safe_drop", id: crypto.randomUUID(), shiftId: shift3, staffId: setup.st.id, at: now(), amount: 20000 };
  assert.equal((await applyDoc(ctx, drop)).ok, true);
  assert.equal((await applyDoc(ctx, drop)).ok, true); // idempotent
  const bad = await applyDoc(ctx, { ...drop, id: crypto.randomUUID(), staffId: other.st.id });
  assert.equal(bad.ok, false);
  assert.equal((await applyDoc(ctx, sale(25, { shiftId: shift3 }))).ok, true);
  assert.equal((await applyDoc(ctx, { kind: "shift_close", id: shift3, staffId: setup.st.id, at: now(), countedCash: 10000 })).ok, true);
  const [s] = await withTenant(t.id, (tx) => tx.select().from(schema.shifts).where(eq(schema.shifts.id, shift3)));
  // açılış 100 TL + döner 2×18=36 TL nakit (net) − seifeye 200 TL = 260 TL = 26000 kuruş
  assert.equal(s.expectedCash, 26000);
  const regs = await withTenant(t.id, (tx) => tx.select().from(schema.registerEvents).where(eq(schema.registerEvents.shiftId, shift3)));
  assert.equal(regs.length, 1);
  assert.equal(regs[0].type, "safe_drop");
  assert.equal(regs[0].total, 20000);
});

// — M3: stok hareketleri ve iade (ayrı vardiya) —
const shift2 = crypto.randomUUID();
const moves = (productId: string) => withTenant(t.id, (tx) => tx.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, productId)));
const refund = (seq: number, refundOf: string, over: Record<string, unknown> = {}) => ({
  kind: "refund", id: crypto.randomUUID(), shiftId: shift2, staffId: setup.st.id, approvedBy: setup.mudur.id, refundOf, receiptSeq: seq, at: now(),
  lines: [{ productId: setup.un.id, name: "Un", unitPrice: 4000, vatRate: 1, qtyMilli: 1000 }],
  payments: [{ method: "nakit", amount: 4000 }], ...over,
});
let unSale = "";

test("satış yalnız stok takipli ürüne hareket yazar", async () => {
  assert.equal((await applyDoc(ctx, { kind: "shift_open", id: shift2, staffId: setup.st.id, at: now(), openingCash: 10000 })).ok, true);
  const d = sale(20, { shiftId: shift2, lines: [{ productId: setup.un.id, name: "Un", unitPrice: 4000, vatRate: 1, qtyMilli: 3000 }, { productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000 }], payments: [{ method: "nakit", amount: 30000 }] });
  unSale = d.id;
  assert.equal((await applyDoc(ctx, d)).ok, true);
  assert.equal((await applyDoc(ctx, d)).ok, true);
  const m = await moves(setup.un.id);
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, "satis");
  assert.equal(m[0].qtyMilli, -3000);
  assert.equal(m[0].saleId, d.id);
  assert.equal((await moves(setup.doner.id)).length, 0);
});

test("fiş sorgusu: iade edilebilir miktar; başka kiracı göremez", async () => {
  const s = await lookupSale(t.id, "K1-000020");
  assert.ok(s);
  assert.equal(s.id, unSale);
  assert.deepEqual(s.lines.map((l) => [l.name, l.qtyMilli]), [["Un", 3000], ["Döner", 1000]]);
  assert.equal(await lookupSale(t2.id, "K1-000020"), null);
  assert.equal(await lookupSale(t.id, "K1-999999"), null);
});

test("fiş çakışması politikası (#25): çekirdek numara ikiz '-N' satışını bulur; tam eşleşme önceliklidir", async () => {
  // Yalnız ikiz var (orijinal örn. budanmış/diğer cihazda): "K1-000040" yazısı "K1-000040-2"yi bulmalı.
  const soloId = crypto.randomUUID();
  await withTenant(t.id, async (tx) => {
    await tx.insert(schema.sales).values({ id: soloId, tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, shiftId, staffId: setup.st.id, receiptNo: "K1-000040-2", total: 18000, change: 0, vat: [{ rate: 10, gross: 18000, net: 16364, vat: 1636 }], createdAt: new Date(), status: "kapandi" });
    await tx.insert(schema.saleLines).values({ tenantId: t.id, saleId: soloId, productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000, total: 18000, discount: 0, cost: null });
  });
  const lu = await lookupSale(t.id, "K1-000040");
  assert.ok(lu, "çekirdek numara ikizi bulamadı");
  assert.equal(lu.receiptNo, "K1-000040-2");
  assert.deepEqual(lu.lines.map((l) => [l.name, l.qtyMilli]), [["Döner", 1000]]);
  // Çakışan gerçek çift: tam eşleşme kazanır, ikiz kendi numarasıyla bulunur.
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  assert.equal((await applyDoc(ctx, sale(30, { id: a }))).ok, true);
  assert.equal((await applyDoc(ctx, sale(30, { id: b }))).ok, true);
  assert.equal((await saleRow(b)).receiptNo, "K1-000030-2");
  assert.equal((await lookupSale(t.id, "K1-000030"))?.receiptNo, "K1-000030");
  assert.equal((await lookupSale(t.id, "K1-000030-2"))?.receiptNo, "K1-000030-2");
  assert.equal(await lookupSale(t.id, "K1-000050"), null);
});

test("iade: idempotent, stok geri girer, fiş sayacından numara, sorguda düşer", async () => {
  const r = refund(21, unSale);
  assert.deepEqual(await applyDoc(ctx, r), { id: r.id, ok: true });
  assert.deepEqual(await applyDoc(ctx, r), { id: r.id, ok: true });
  const row = await saleRow(r.id);
  assert.equal(row.status, "iade");
  assert.equal(row.refundOf, unSale);
  assert.equal(row.receiptNo, "K1-000021");
  assert.equal(row.total, 4000);
  assert.equal(row.review, null);
  const m = await moves(setup.un.id);
  assert.deepEqual(m.map((x) => [x.kind, x.qtyMilli]).sort(), [["iade", 1000], ["satis", -3000]]);
  const s = await lookupSale(t.id, "K1-000020");
  assert.deepEqual(s!.lines.map((l) => [l.name, l.qtyMilli]), [["Un", 2000], ["Döner", 1000]]);
});

test("iade reddedilmez: fazla iade, bilinmeyen asıl satış, ödeme farkı, müdür olmayan onay → review", async () => {
  const over = refund(22, unSale, { lines: [{ productId: setup.un.id, name: "Un", unitPrice: 4000, vatRate: 1, qtyMilli: 5000 }], payments: [{ method: "nakit", amount: 20000 }] });
  assert.equal((await applyDoc(ctx, over)).ok, true);
  assert.match((await saleRow(over.id)).review!, /satılandan fazla iade: Un/);
  const ghost = refund(23, crypto.randomUUID(), { payments: [{ method: "kart", amount: 3000 }], approvedBy: setup.st.id });
  assert.equal((await applyDoc(ctx, ghost)).ok, true);
  const g = await saleRow(ghost.id);
  assert.match(g.review!, /asıl satış bulunamadı/);
  assert.match(g.review!, /iade ödemesi toplamla eşleşmiyor/);
  assert.match(g.review!, /onaylayan müdür değil/);
  assert.equal((await applyDoc(ctx, refund(24, unSale, { approvedBy: other.st.id }))).ok, false);
});

test("gün sonu iadeleri düşer", async () => {
  assert.equal((await applyDoc(ctx, { kind: "shift_close", id: shift2, staffId: setup.st.id, at: now(), countedCash: 0 })).ok, true);
  const [s] = await withTenant(t.id, (tx) => tx.select().from(schema.shifts).where(eq(schema.shifts.id, shift2)));
  // açılış 100 + satış nakit 300 (Un 120 + Döner 180) − nakit iadeler 40 + 200; kartla iade (30) kasayı etkilemez
  assert.equal(s.expectedCash, 10000 + 30000 - 4000 - 20000);
});


test("çekmece denetim kaydı idempotent", async () => {
  const doc = { kind: "audit", id: crypto.randomUUID(), staffId: setup.st.id, approvedBy: null, at: now(), action: "cekmece" };
  assert.deepEqual(await applyDoc(ctx, doc), { id: doc.id, ok: true });
  assert.deepEqual(await applyDoc(ctx, doc), { id: doc.id, ok: true });
  const rows = await withTenant(t.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.id, doc.id)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "kasa.cekmece");
  assert.equal((await applyDoc(ctx, { ...doc, id: crypto.randomUUID(), action: "kasa_sil" })).ok, false);
});

test("M9a: register_event idempotent, vardiyasız reddedilir, RLS", async () => {
  await applyDoc(ctx, { kind: "shift_open", id: shiftId, staffId: setup.st.id, at: now(), openingCash: 0 }); // zaten açıksa no-op
  const ev = {
    kind: "register_event", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, at: now(), type: "cart_cleared",
    lines: [{ productId: setup.doner.id, name: "Döner", qtyMilli: 2000, total: 36000 }, { productId: null, name: "Serbest", qtyMilli: 1000, total: 500 }],
  };
  assert.deepEqual(await applyDoc(ctx, ev), { id: ev.id, ok: true });
  assert.deepEqual(await applyDoc(ctx, ev), { id: ev.id, ok: true });
  const rows = await withTenant(t.id, (tx) => tx.select().from(schema.registerEvents).where(eq(schema.registerEvents.id, ev.id)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 36500);
  assert.equal(rows[0].type, "cart_cleared");
  const bad = await applyDoc(ctx, { ...ev, id: crypto.randomUUID(), shiftId: crypto.randomUUID() });
  assert.equal(bad.ok, false);
  assert.equal((await applyDoc(ctx, { ...ev, id: crypto.randomUUID(), type: "baska" })).ok, false);
  const leak = await withTenant(t2.id, (tx) => tx.select().from(schema.registerEvents));
  assert.equal(leak.length, 0);
});
