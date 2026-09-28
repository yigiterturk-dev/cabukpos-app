// tests/tab-db.test.ts — cabukpos_test, uygulama rolü. Adisyon olayları: idempotentlik, yetki → review + audit, masadan satış → paid, akış, RLS.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc, tabEventsOf } = await import("@/lib/sync/apply");
const { eventsAfter, initialEvents } = await import("@/lib/tabs/stream");
const { foldTabs } = await import("@/lib/core/tab");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "TAB-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "TAB-T2", vertical: "restoran" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [garson] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ayşe", role: "garson", pinHash: "x" }).returning();
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [kofte] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Köfte", price: 20000, vatRate: 10 }).returning();
  const [area] = await tx.insert(schema.areas).values({ tenantId: t.id, storeId: store.id, name: "Salon" }).returning();
  const [m1, m2] = await tx.insert(schema.tables).values([{ tenantId: t.id, areaId: area.id, name: "M1" }, { tenantId: t.id, areaId: area.id, name: "M2" }]).returning();
  const [grp] = await tx.insert(schema.optionGroups).values({ tenantId: t.id, name: "Ekstra", min: 0, max: 2 }).returning();
  const [pey] = await tx.insert(schema.options).values({ tenantId: t.id, groupId: grp.id, name: "Peynir", delta: 1500 }).returning();
  return { store, garson, mudur, kofte, m1, m2, pey };
});
const foreign = await withTenant(t2.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t2.id, name: "Öteki" }).returning();
  const [area] = await tx.insert(schema.areas).values({ tenantId: t2.id, storeId: store.id, name: "Bahçe" }).returning();
  const [tbl] = await tx.insert(schema.tables).values({ tenantId: t2.id, areaId: area.id, name: "B1" }).returning();
  return { store, tbl };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kasa", receiptPrefix: "K1" }).returning();
const [tablet] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Garson", receiptPrefix: "G1", role: "garson" }).returning();
const kasa = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, receiptPrefix: "K1" };
const garsonCtx = { ...kasa, deviceId: tablet.id, receiptPrefix: "G1" };
const ctxStream = { tenantId: t.id, storeId: s.store.id };

const tabId = crypto.randomUUID();
const lineA = crypto.randomUUID();
const now = () => new Date().toISOString();
const tabDoc = (ev: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  ({ kind: "tab", id: crypto.randomUUID(), tabId, tableId: s.m1.id, at: now(), staffId: s.garson.id, approvedBy: null, ev, ...over });
const addEv = (lineId: string, extra: Record<string, unknown> = {}) =>
  ({ type: "add", lineId, productId: s.kofte.id, name: "Köfte", unitPrice: 21500, vatRate: 10, qtyMilli: 2000, options: [{ id: s.pey.id, name: "Peynir", delta: 1500 }], note: "az pişmiş", stationId: null, ...extra });

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});

test("olay idempotent; başka kiracının masası ve personelsiz satır eklemesi reddedilir", async () => {
  const open = tabDoc({ type: "open", guests: 2 });
  assert.deepEqual(await applyDoc(garsonCtx, open), { id: open.id, ok: true });
  assert.deepEqual(await applyDoc(garsonCtx, open), { id: open.id, ok: true });
  const add = tabDoc(addEv(lineA));
  assert.equal((await applyDoc(garsonCtx, add)).ok, true);
  assert.equal((await applyDoc(garsonCtx, tabDoc(addEv(crypto.randomUUID()), { tableId: foreign.tbl.id }))).ok, false);
  assert.equal((await applyDoc(garsonCtx, tabDoc(addEv(crypto.randomUUID()), { staffId: null }))).ok, false);
  const evs = await withTenant(t.id, (tx) => tabEventsOf(tx, tabId));
  assert.equal(evs.length, 2);
  assert.ok(evs[0].seq! < evs[1].seq!);
});

test("garsonun ikramı müdürsüz → kaydedilir, review + audit; müdür onaylı → temiz", async () => {
  const comp = tabDoc({ type: "comp", lineId: lineA, reason: "bekletildi" });
  assert.equal((await applyDoc(garsonCtx, comp)).ok, true);
  const disc = tabDoc({ type: "discount", percent: 10, amount: null, reason: "müdavim" }, { approvedBy: s.mudur.id });
  assert.equal((await applyDoc(garsonCtx, disc)).ok, true);
  const rows = await withTenant(t.id, (tx) => tx.select().from(schema.tabEvents).where(eq(schema.tabEvents.tabId, tabId)));
  assert.equal(rows.find((r) => r.id === comp.id)!.review, "müdür onayı yok");
  assert.equal(rows.find((r) => r.id === disc.id)!.review, null);
  const audits = await withTenant(t.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "masa.comp")));
  assert.equal(audits.length, 1);
  // Geri al: ikramı kaldırmak için satırı iptal etmek yerine yeni satır (sonraki test tam fiyat ödeme ister)
  await applyDoc(garsonCtx, tabDoc({ type: "discount", percent: null, amount: null, reason: "" }, { approvedBy: s.mudur.id }));
});

test("masadan satış: seçenekli fiyat temiz, satır ekleri yazılır, paid olayı; ikinci ödeme review", async () => {
  const lineB = crypto.randomUUID();
  await applyDoc(garsonCtx, tabDoc(addEv(lineB, { options: [], note: null, unitPrice: 20000, qtyMilli: 1000 })));
  const shiftId = crypto.randomUUID();
  await applyDoc(kasa, { kind: "shift_open", id: shiftId, staffId: s.mudur.id, at: now(), openingCash: 0 });
  const sale = (seq: number) => ({
    kind: "sale", id: crypto.randomUUID(), shiftId, staffId: s.mudur.id, receiptSeq: seq, at: now(),
    lines: [{ productId: s.kofte.id, name: "Köfte", unitPrice: 20000, vatRate: 10, qtyMilli: 1000, options: [], note: null, discount: 0 }],
    payments: [{ method: "nakit", amount: 20000 }],
    tab: { tabId, tableId: s.m1.id, paidLines: [{ lineId: lineB, qtyMilli: 1000, discount: 0 }] },
  });
  const first = sale(1);
  assert.equal((await applyDoc(kasa, first)).ok, true);
  const [row] = await withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, first.id)));
  assert.equal(row.channel, "masa");
  assert.equal(row.tabId, tabId);
  assert.equal(row.review, null);
  const state = foldTabs(await withTenant(t.id, (tx) => tabEventsOf(tx, tabId))).get(tabId)!;
  assert.equal(state.lines.find((l) => l.lineId === lineB)!.paidMilli, 1000);
  const again = sale(2);
  assert.equal((await applyDoc(kasa, again)).ok, true);
  const [dup] = await withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, again.id)));
  assert.match(dup.review ?? "", /adisyonda ödenmiş/);

  // Seçenekli satır: birim fiyat = ürün + peynir; indirim payı ve not satıra yazılır
  const withOpt = { ...sale(3), id: crypto.randomUUID(), tab: undefined, lines: [{ productId: s.kofte.id, name: "Köfte", unitPrice: 21500, vatRate: 10, qtyMilli: 1000, options: [{ id: s.pey.id, name: "Peynir", delta: 1500 }], note: "az pişmiş", discount: 1500 }], payments: [{ method: "kart", amount: 20000 }] };
  assert.equal((await applyDoc(kasa, withOpt)).ok, true);
  const [r3] = await withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, withOpt.id)));
  assert.equal(r3.review, null);
  assert.equal(r3.total, 20000);
  const [l3] = await withTenant(t.id, (tx) => tx.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, withOpt.id)));
  assert.deepEqual([l3.note, l3.discount, l3.total, l3.options?.[0].name], ["az pişmiş", 1500, 20000, "Peynir"]);
});

test("akış: ilk bağlantı tüm adisyon, sonra imleçten sonrası; başka kiracı göremez", async () => {
  const all = await initialEvents(ctxStream);
  assert.ok(all.length >= 5);
  assert.ok(all.every((e) => e.tabId === tabId));
  const last = all.at(-1)!.seq!;
  assert.deepEqual(await eventsAfter(ctxStream, last), []);
  const mv = tabDoc({ type: "move", toTableId: s.m2.id });
  await applyDoc(garsonCtx, mv);
  const next = await eventsAfter(ctxStream, last);
  assert.deepEqual(next.map((e) => e.id), [mv.id]);
  assert.deepEqual(await eventsAfter({ tenantId: t2.id, storeId: s.store.id }, 0), []);
  assert.deepEqual(await initialEvents({ tenantId: t2.id, storeId: foreign.store.id }), []);
});
