// tests/stock-db.test.ts — cabukpos_test, uygulama rolü. SQL stok düzeyi = saf stockLevel.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { stockLevels } = await import("@/lib/admin/stock");
const { stockLevel } = await import("@/lib/core/stock");
const { applyDoc } = await import("@/lib/sync/apply");
const { eq, and } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "STOK-T", vertical: "market" }).returning();
const [r] = await getDb().insert(schema.tenants).values({ name: "RECETE-T", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, r.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("SQL stok düzeyi saf hesapla aynı; takipsiz ürün listelenmez", async () => {
  const at = (m: number) => new Date(Date.UTC(2026, 8, 28, 10, m));
  const plan: Record<string, [("satis" | "iade" | "alis" | "sayim" | "fire"), number, number][]> = {
    A: [["alis", 10000, 0], ["satis", -3000, 1], ["iade", 1000, 2]],
    B: [["alis", 10000, 0], ["sayim", 20000, 5], ["satis", -3000, 6], ["satis", -2000, 4], ["fire", -500, 7]],
    C: [["sayim", 5000, 1], ["sayim", 7000, 3], ["alis", 1000, 2], ["satis", -1000, 4]],
    D: [],
  };
  const levels = await withTenant(t.id, async (tx) => {
    const [st] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
    for (const [name, moves] of Object.entries(plan)) {
      const [p] = await tx.insert(schema.products).values({ tenantId: t.id, name, price: 100, vatRate: 1, trackStock: true }).returning();
      if (moves.length) await tx.insert(schema.stockMovements).values(moves.map(([kind, q, m]) => ({ tenantId: t.id, storeId: st.id, productId: p.id, kind, qtyMilli: q, at: at(m), actor: "test" })));
    }
    await tx.insert(schema.products).values({ tenantId: t.id, name: "Takipsiz", price: 100, vatRate: 1 });
    return stockLevels(tx, st.id);
  });
  const got = Object.fromEntries(levels.map((l) => [l.name, l.level]));
  const want = Object.fromEntries(Object.entries(plan).map(([n, ms]) => [n, stockLevel(ms.map(([kind, q, m]) => ({ kind, qtyMilli: q, at: at(m).toISOString() })))]));
  assert.deepEqual(got, want);
  assert.deepEqual(want, { A: 8000, B: 16500, C: 6000, D: 0 });
});

// — M7: reçete düşümü + satır maliyeti (E2E rakamları: un 20 TL/kg, kıyma 400 TL/kg, harç 248 TL/kg) —
test("reçeteli satış hammaddeyi düşer, sale_lines.cost donar; iade ters; RLS", async () => {
  const s = await withTenant(r.id, async (tx) => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: r.id, name: "Merkez" }).returning();
    const [st] = await tx.insert(schema.staff).values({ tenantId: r.id, name: "Ali", pinHash: "x" }).returning();
    const [mudur] = await tx.insert(schema.staff).values({ tenantId: r.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
    const raw = { tenantId: r.id, price: 0, vatRate: 1, sellable: false, trackStock: true, unit: "kg" as const };
    const [un] = await tx.insert(schema.products).values({ ...raw, name: "Un", cost: 2000 }).returning();
    const [kiyma] = await tx.insert(schema.products).values({ ...raw, name: "Kıyma", cost: 40000 }).returning();
    const [harc] = await tx.insert(schema.products).values({ ...raw, name: "Harç", cost: 24800, yieldMilli: 1000 }).returning();
    const [lah] = await tx.insert(schema.products).values({ tenantId: r.id, name: "Lahmacun", price: 12000, vatRate: 10, trackStock: true }).returning();
    const [ayran] = await tx.insert(schema.products).values({ tenantId: r.id, name: "Ayran", price: 3000, vatRate: 10 }).returning();
    const [g] = await tx.insert(schema.optionGroups).values({ tenantId: r.id, name: "Ekstra", min: 0, max: 1 }).returning();
    const [ek] = await tx.insert(schema.options).values({ tenantId: r.id, groupId: g.id, name: "Ekstra kıyma", delta: 2000 }).returning();
    await tx.insert(schema.productOptionGroups).values({ tenantId: r.id, productId: lah.id, groupId: g.id });
    await tx.insert(schema.recipeItems).values([
      { tenantId: r.id, productId: lah.id, ingredientId: harc.id, qtyMilli: 100 },
      { tenantId: r.id, productId: lah.id, ingredientId: un.id, qtyMilli: 150 },
      { tenantId: r.id, optionId: ek.id, ingredientId: kiyma.id, qtyMilli: 30 },
    ]);
    return { store, st, mudur, un, kiyma, harc, lah, ayran, ek };
  });
  const [dev] = await getDb().insert(schema.devices).values({ tenantId: r.id, storeId: s.store.id, name: "Kasa", receiptPrefix: "R1" }).returning();
  const ctx = { tenantId: r.id, storeId: s.store.id, deviceId: dev.id, receiptPrefix: "R1" };
  const shiftId = crypto.randomUUID();
  const at = new Date().toISOString();
  assert.equal((await applyDoc(ctx, { kind: "shift_open", id: shiftId, staffId: s.st.id, at, openingCash: 0 })).ok, true);
  const opt = [{ id: s.ek.id, name: "Ekstra kıyma", delta: 2000 }];
  const sale = { kind: "sale", id: crypto.randomUUID(), shiftId, staffId: s.st.id, receiptSeq: 1, at, payments: [{ method: "nakit", amount: 41000 }],
    lines: [
      { productId: s.lah.id, name: "Lahmacun", unitPrice: 12000, vatRate: 10, qtyMilli: 2000 },
      { productId: s.lah.id, name: "Lahmacun", unitPrice: 14000, vatRate: 10, qtyMilli: 1000, options: opt },
      { productId: s.ayran.id, name: "Ayran", unitPrice: 3000, vatRate: 10, qtyMilli: 1000 },
    ] };
  assert.equal((await applyDoc(ctx, sale)).ok, true);
  const q = async (saleId: string) => withTenant(r.id, async (tx) => ({
    moves: Object.fromEntries((await tx.select().from(schema.stockMovements).where(eq(schema.stockMovements.saleId, saleId))).map((m) => [m.productId, [m.kind, m.qtyMilli]])),
    costs: (await tx.select({ cost: schema.saleLines.cost }).from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId))).map((l) => l.cost).sort(),
  }));
  const a = await q(sale.id);
  // 3 lahmacun: harç 300 g, un 450 g; ekstra: kıyma 30 g. Lahmacun trackStock olsa da reçeteli → kendi stoğu düşmez.
  assert.deepEqual(a.moves, { [s.harc.id]: ["recete", -300], [s.un.id]: ["recete", -450], [s.kiyma.id]: ["recete", -30] });
  assert.deepEqual(a.costs, [3980, 5560, null].sort()); // ayranın maliyeti yok → null

  const refund = { kind: "refund", id: crypto.randomUUID(), shiftId, staffId: s.st.id, approvedBy: s.mudur.id, refundOf: sale.id, receiptSeq: 2, at,
    lines: [{ productId: s.lah.id, name: "Lahmacun", unitPrice: 14000, vatRate: 10, qtyMilli: 1000, options: opt }], payments: [{ method: "nakit", amount: 14000 }] };
  assert.equal((await applyDoc(ctx, refund)).ok, true);
  const b = await q(refund.id);
  assert.deepEqual(b.moves, { [s.harc.id]: ["recete", 100], [s.un.id]: ["recete", 150], [s.kiyma.id]: ["recete", 30] });
  assert.deepEqual(b.costs, [3980]);

  // RLS: başka kiracı reçeteyi ve hammaddeyi görmez
  const seen = await withTenant(t.id, (tx) => tx.select().from(schema.recipeItems).where(eq(schema.recipeItems.productId, s.lah.id)));
  assert.equal(seen.length, 0);
  const own = await withTenant(r.id, (tx) => tx.select().from(schema.products).where(and(eq(schema.products.tenantId, r.id), eq(schema.products.sellable, false))));
  assert.equal(own.length, 3);
});

test("alış: +hareket, maliyet (eski tarih ezmez), iptal ters hareket; bakiye; RLS", async () => {
  const { recordPurchase, cancelPurchase, suppliersWithBalance, supplierStatement } = await import("@/lib/admin/purchase");
  const res = await withTenant(r.id, async (tx) => {
    const [store] = await tx.select().from(schema.stores).limit(1);
    const [un] = await tx.insert(schema.products).values({ tenantId: r.id, name: "Un2", price: 0, vatRate: 1, sellable: false, trackStock: true, unit: "kg" }).returning();
    const [sup] = await tx.insert(schema.suppliers).values({ tenantId: r.id, name: "Toptancı" }).returning();
    const a = await recordPurchase(tx, r.id, null, { storeId: store.id, supplierId: sup.id, docNo: "A1", date: "2026-09-28", note: null, lines: [{ productId: un.id, qtyMilli: 10000, unitCost: 2000 }] });
    const b = await recordPurchase(tx, r.id, null, { storeId: store.id, supplierId: sup.id, docNo: "A0", date: "2026-09-20", note: null, lines: [{ productId: un.id, qtyMilli: 5000, unitCost: 1500 }] });
    assert.ok("id" in a && "id" in b);
    const cost1 = (await tx.select({ cost: schema.products.cost }).from(schema.products).where(eq(schema.products.id, un.id)))[0].cost;
    assert.equal(await cancelPurchase(tx, null, b.id), null);
    assert.match((await cancelPurchase(tx, null, b.id))!, /iptal/);
    await tx.insert(schema.supplierPayments).values({ tenantId: r.id, supplierId: sup.id, amount: 5000, method: "nakit", date: "2026-09-28" });
    const moves = (await tx.select({ q: schema.stockMovements.qtyMilli }).from(schema.stockMovements).where(eq(schema.stockMovements.productId, un.id))).map((m) => m.q).sort((x, y) => x - y);
    const bad = await recordPurchase(tx, r.id, null, { storeId: store.id, supplierId: null, docNo: null, date: "2026-09-28", note: null, lines: [{ productId: crypto.randomUUID(), qtyMilli: 1000, unitCost: 1 }] });
    return { cost1, moves, bal: (await suppliersWithBalance(tx)).find((s) => s.id === sup.id)!.balance, st: await supplierStatement(tx, sup.id), bad, supId: sup.id };
  });
  assert.equal(res.cost1, 2000); // 20.09 fişi 28.09 fiyatını ezmedi
  assert.deepEqual(res.moves, [-5000, 5000, 10000]);
  assert.equal(res.bal, 20000 - 5000); // iptal sayılmaz
  assert.equal(res.st.balance, 15000);
  assert.deepEqual(res.st.rows.map((x) => [x.kind, x.amount, x.cancelled]), [["alis", 20000, false], ["odeme", -5000, false], ["alis", 7500, true]]);
  assert.ok("error" in res.bad);
  const seen = await withTenant(t.id, (tx) => tx.select().from(schema.purchases).where(eq(schema.purchases.supplierId, res.supId)));
  assert.equal(seen.length, 0);
});
