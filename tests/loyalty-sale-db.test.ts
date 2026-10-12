// tests/loyalty-sale-db.test.ts — cabukpos_test, uygulama rolü. #33: kasa satış anında kupon + puan + hediye kartı.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { eq, sql } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "SADAKAT-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "SADAKAT-T2", vertical: "market" }).returning();

const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  const [customer] = await tx.insert(schema.customers).values({ tenantId: t.id, phone: "05551112233", name: "Veli" }).returning();
  await tx.insert(schema.loyaltySettings).values({ tenantId: t.id, enabled: true, kurusPerPoint: 10000, kurusPerRedeem: 100, minRedeemPoints: 10 });
  await tx.insert(schema.loyaltyEvents).values({ tenantId: t.id, customerId: customer.id, kind: "kazanc", points: 50, actor: "test" });
  // Sınırsız kupon (indirim testleri) + tek-kullanımlık kupon (limit testi).
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [coupon] = await tx.insert(schema.coupons).values({ tenantId: t.id, code: "IND10", kind: "yuzde", value: 10, minSubtotal: 0, perCustomerLimit: 99 }).returning();
  const [limited] = await tx.insert(schema.coupons).values({ tenantId: t.id, code: "TEK", kind: "yuzde", value: 10, minSubtotal: 0, usageLimit: 1, usedCount: 1, perCustomerLimit: 99 }).returning();
  const [gift] = await tx.insert(schema.giftCards).values({ tenantId: t.id, code: "HK-KART01", initialKurus: 10000, balanceKurus: 10000 }).returning();
  return { store, st, mudur, doner, customer, coupon, limited, gift };
});
// Kiracı 2: aynı kupon kodu ayrı kiracıda farklı (tutar 500); izolasyon testi için.
const [t2coupon] = await withTenant(t2.id, (tx) => tx.insert(schema.coupons).values({ tenantId: t2.id, code: "IND10", kind: "tutar", value: 500, minSubtotal: 0 }).returning());

const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: setup.store.id, name: "Kasa 1", receiptPrefix: "K1" }).returning();
const ctx = { tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, receiptPrefix: "K1" };
const shiftId = crypto.randomUUID();
await withTenant(t.id, (tx) => tx.insert(schema.shifts).values({ id: shiftId, tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, openedBy: setup.st.id, openingCash: 0 }));
const now = () => new Date().toISOString();
const sale = (seq: number, over: Record<string, unknown> = {}) => ({
  kind: "sale", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, receiptSeq: seq, at: now(),
  lines: [{ productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 2000 }], // ara toplam 36000
  payments: [{ method: "nakit", amount: 40000 }], ...over,
});
const saleRow = (id: string) => withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id))).then((r) => r[0]);

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});

test("kupon: sunucu indirimi uygular, kullanım defteri + sayaç artar; satış yazılır", async () => {
  const d = sale(1, { coupon: { code: "IND10", discount: 3600 }, payments: [{ method: "nakit", amount: 32400 }] });
  assert.deepEqual(await applyDoc(ctx, d), { id: d.id, ok: true });
  const r = await saleRow(d.id);
  assert.equal(r.total, 36000);
  assert.equal(r.discount, 3600);
  assert.equal(r.review, null);
  const uses = await withTenant(t.id, (tx) => tx.select().from(schema.couponUses).where(eq(schema.couponUses.saleId, d.id)));
  assert.equal(uses.length, 1);
  assert.equal(uses[0].discountKurus, 3600);
  const [c] = await withTenant(t.id, (tx) => tx.select().from(schema.coupons).where(eq(schema.coupons.id, setup.coupon.id)));
  assert.equal(c.usedCount, 1);
});

test("kupon limiti dolunca reddedilir ama satış yine kaydedilir (review)", async () => {
  const d = sale(2, { coupon: { code: "TEK", discount: 3600 }, payments: [{ method: "nakit", amount: 32400 }] });
  assert.equal((await applyDoc(ctx, d)).ok, true);
  const r = await saleRow(d.id);
  assert.equal(r.discount, 0); // sunucu geçersiz kuponu uygulamaz
  assert.match(r.review ?? "", /kupon/);
});

test("puan: bakiye içinde harcanır + indirimli toplam üzerinden kazanılır", async () => {
  const d = sale(3, {
    customerId: setup.customer.id,
    loyalty: { customerId: setup.customer.id, points: 20, discount: 2000 },
    payments: [{ method: "kart", amount: 34000 }],
  });
  assert.deepEqual(await applyDoc(ctx, d), { id: d.id, ok: true });
  const r = await saleRow(d.id);
  assert.equal(r.discount, 2000);
  assert.equal(r.customerId, setup.customer.id);
  assert.equal(r.review, null);
  const ev = await withTenant(t.id, (tx) => tx.select().from(schema.loyaltyEvents).where(eq(schema.loyaltyEvents.saleId, d.id)));
  assert.deepEqual(ev.map((e) => [e.kind, e.points]).sort(), [["harcanma", -20], ["kazanc", 3]]); // (36000-2000)/10000 = 3
  const [bal] = await withTenant(t.id, (tx) => tx.select({ total: sql<number>`coalesce(sum(${schema.loyaltyEvents.points}), 0)::int` }).from(schema.loyaltyEvents).where(eq(schema.loyaltyEvents.customerId, setup.customer.id)));
  assert.equal(Number(bal.total), 33); // 50 - 20 + 3
});

test("hediye kartı: bakiye düşer, kart biter, harcama defteri ve ödeme satırı yazılır", async () => {
  const d = sale(4, {
    giftCard: { code: "HK-KART01", amount: 10000 },
    payments: [{ method: "hediye_karti", amount: 10000 }, { method: "nakit", amount: 26000 }],
  });
  assert.deepEqual(await applyDoc(ctx, d), { id: d.id, ok: true });
  const r = await saleRow(d.id);
  assert.equal(r.review, null);
  const [card] = await withTenant(t.id, (tx) => tx.select().from(schema.giftCards).where(eq(schema.giftCards.id, setup.gift.id)));
  assert.equal(card.balanceKurus, 0);
  assert.equal(card.status, "bitti");
  const ev = await withTenant(t.id, (tx) => tx.select().from(schema.giftCardEvents).where(eq(schema.giftCardEvents.saleId, d.id)));
  assert.deepEqual(ev.map((e) => [e.kind, e.amountKurus]), [["harcama", -10000]]);
  const pays = await withTenant(t.id, (tx) => tx.select().from(schema.payments).where(eq(schema.payments.saleId, d.id)));
  assert.deepEqual(pays.map((p) => [p.method, p.amount]).sort(), [["hediye_karti", 10000], ["nakit", 26000]]);
});

test("idempotentlik: aynı satış belgesi ikinci kez işlenmez (defter ikilenmez)", async () => {
  const d = sale(5, { coupon: { code: "IND10", discount: 3600 }, payments: [{ method: "nakit", amount: 32400 }] });
  await applyDoc(ctx, d);
  await applyDoc(ctx, d);
  const uses = await withTenant(t.id, (tx) => tx.select().from(schema.couponUses).where(eq(schema.couponUses.saleId, d.id)));
  assert.equal(uses.length, 1);
});

test("uyuşmazlık: yanlış kupon indirimi satışı engellemez, sunucu doğrusunu yazar (review)", async () => {
  const d = sale(6, { coupon: { code: "IND10", discount: 999 }, payments: [{ method: "nakit", amount: 35100 }] });
  assert.equal((await applyDoc(ctx, d)).ok, true);
  const r = await saleRow(d.id);
  assert.equal(r.discount, 3600); // sunucu doğru indirimi yazar
  assert.match(r.review ?? "", /uyuşmadı/);
});

test("iade: hediye kartı bakiyesi kademeli geri döner, puan kazancı geri alınır (kümülatif oran)", async () => {
  const { c, card } = await withTenant(t.id, async (tx) => {
    const [c] = await tx.insert(schema.customers).values({ tenantId: t.id, phone: "05559998877", name: "İade Müşteri" }).returning();
    await tx.insert(schema.loyaltyEvents).values({ tenantId: t.id, customerId: c.id, kind: "kazanc", points: 100, actor: "test" });
    const [card] = await tx.insert(schema.giftCards).values({ tenantId: t.id, code: "HK-R03", initialKurus: 10000, balanceKurus: 10000 }).returning();
    return { c, card };
  });
  // Satış: 2×döner (36000), hediye kartı 10000 + nakit 26000; kazanç = 36000/10000 = 3 puan
  const d = sale(10, {
    customerId: c.id, giftCard: { code: "HK-R03", amount: 10000 },
    payments: [{ method: "hediye_karti", amount: 10000 }, { method: "nakit", amount: 26000 }],
  });
  assert.deepEqual(await applyDoc(ctx, d), { id: d.id, ok: true });
  const bal = async () => withTenant(t.id, (tx) => tx.select({ t: sql<number>`coalesce(sum(${schema.loyaltyEvents.points}), 0)::int` }).from(schema.loyaltyEvents).where(eq(schema.loyaltyEvents.customerId, c.id))).then((r) => Number(r[0].t));
  const cardRow = async () => withTenant(t.id, (tx) => tx.select().from(schema.giftCards).where(eq(schema.giftCards.id, card.id))).then((r) => r[0]);
  assert.equal(await bal(), 103); // 100 + 3
  assert.equal((await cardRow()).balanceKurus, 0);
  assert.equal((await cardRow()).status, "bitti");

  const refund = (seq: number, qtyMilli: number) => ({ kind: "refund", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, approvedBy: setup.mudur.id, refundOf: d.id, receiptSeq: seq, at: now(), lines: [{ productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli }], payments: [{ method: "nakit", amount: Math.round((18000 * qtyMilli) / 1000) }] });

  // Yarım iade: oran 0.5 → kart 5000 geri, kazanç 1 geri
  assert.equal((await applyDoc(ctx, refund(11, 1000))).ok, true);
  assert.equal((await cardRow()).balanceKurus, 5000);
  assert.equal((await cardRow()).status, "aktif");
  assert.equal(await bal(), 102);

  // Kalan yarım: kümülatif oran 1 → kart 10000, kazanç tam geri
  assert.equal((await applyDoc(ctx, refund(12, 1000))).ok, true);
  assert.equal((await cardRow()).balanceKurus, 10000);
  assert.equal(await bal(), 100); // 100 + 3 - 1 - 2

  const ge = await withTenant(t.id, (tx) => tx.select().from(schema.giftCardEvents).where(eq(schema.giftCardEvents.saleId, d.id)));
  assert.deepEqual(ge.map((e) => [e.kind, e.amountKurus]).sort(), [["harcama", -10000], ["iade", 5000], ["iade", 5000]]);
  const le = await withTenant(t.id, (tx) => tx.select().from(schema.loyaltyEvents).where(eq(schema.loyaltyEvents.saleId, d.id)));
  assert.deepEqual(le.map((e) => [e.kind, e.points]).sort(), [["iade", -1], ["iade", -2], ["kazanc", 3]]);
});

test("iade: satış tümüyle iade edilince kupon kullanımı geri alınır", async () => {
  const [coup] = await withTenant(t.id, (tx) => tx.insert(schema.coupons).values({ tenantId: t.id, code: "KUP-REF", kind: "yuzde", value: 10, minSubtotal: 0, perCustomerLimit: 99 }).returning());
  const d = sale(20, { coupon: { code: "KUP-REF", discount: 3600 }, payments: [{ method: "nakit", amount: 32400 }] });
  await applyDoc(ctx, d);
  const [c1] = await withTenant(t.id, (tx) => tx.select().from(schema.coupons).where(eq(schema.coupons.id, coup.id)));
  assert.equal(c1.usedCount, 1);
  // İade NET öder (36000 − %10 indirim = 32400); müşteri ödediğinden fazlasını almaz.
  const r = { kind: "refund", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, approvedBy: setup.mudur.id, refundOf: d.id, receiptSeq: 21, at: now(), lines: [{ productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 2000 }], payments: [{ method: "nakit", amount: 32400 }] };
  assert.equal((await applyDoc(ctx, r)).ok, true);
  const rr = await saleRow(r.id);
  assert.equal(rr.total, 36000);
  assert.equal(rr.discount, 3600);
  assert.equal(rr.review, null);
  const [rp] = await withTenant(t.id, (tx) => tx.select().from(schema.payments).where(eq(schema.payments.saleId, r.id)));
  assert.equal(rp.amount, 32400);
  const [c2] = await withTenant(t.id, (tx) => tx.select().from(schema.coupons).where(eq(schema.coupons.id, coup.id)));
  assert.equal(c2.usedCount, 0);
  const uses = await withTenant(t.id, (tx) => tx.select().from(schema.couponUses).where(eq(schema.couponUses.saleId, d.id)));
  assert.equal(uses.length, 0);
});

test("kiracı izolasyonu: kendi kiracının kuponu kullanılır, diğerinin değil", async () => {
  const d = sale(7, { coupon: { code: "IND10", discount: 500 }, payments: [{ method: "nakit", amount: 35500 }] });
  assert.equal((await applyDoc(ctx, d)).ok, true);
  const r = await saleRow(d.id);
  assert.equal(r.discount, 3600); // t'nin %10'u, t2'nin tutar-500'ü değil
  const [c2] = await withTenant(t2.id, (tx) => tx.select().from(schema.coupons).where(eq(schema.coupons.id, t2coupon.id)));
  assert.equal(c2.usedCount, 0);
});
