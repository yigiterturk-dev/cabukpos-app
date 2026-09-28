// tests/report-db.test.ts — cabukpos_test, uygulama rolü. Dönem sorguları + CSV + RLS.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { summaryData, heatData, productData, staffData, staffEvents, reportCsv } = await import("@/lib/admin/report");
const { istToday } = await import("@/lib/core/report");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "RAPOR-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "RAPOR-T2", vertical: "market" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [cat] = await tx.insert(schema.categories).values({ tenantId: t.id, name: "Ana yemek" }).returning();
  const [ali] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10, categoryId: cat.id }).returning();
  const [ayran] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Ayran", price: 2500, vatRate: 10 }).returning();
  await tx.insert(schema.products).values({ tenantId: t.id, name: "Künefe", price: 9000, vatRate: 10 });
  await tx.insert(schema.products).values({ tenantId: t.id, name: "Un", price: 100, vatRate: 1, sellable: false });
  return { store, cat, ali, mudur, doner, ayran };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kasa 1", receiptPrefix: "R1" }).returning();
const ctx = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, receiptPrefix: "R1" };
const shiftId = crypto.randomUUID();
const at = new Date().toISOString();
const ok = async (doc: Record<string, unknown>) => assert.equal((await applyDoc(ctx, doc)).ok, true);
await ok({ kind: "shift_open", id: shiftId, staffId: s.ali.id, at, openingCash: 0 });
const sale1 = crypto.randomUUID();
await ok({ kind: "sale", id: sale1, shiftId, staffId: s.ali.id, receiptSeq: 1, at, lines: [{ productId: s.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 2000 }, { productId: s.ayran.id, name: "Ayran", unitPrice: 2500, vatRate: 10, qtyMilli: 1000 }], payments: [{ method: "nakit", amount: 40000 }] });
await ok({ kind: "refund", id: crypto.randomUUID(), shiftId, staffId: s.ali.id, approvedBy: s.mudur.id, refundOf: sale1, receiptSeq: 2, at, lines: [{ productId: s.ayran.id, name: "Ayran", unitPrice: 2500, vatRate: 10, qtyMilli: 1000 }], payments: [{ method: "nakit", amount: 2500 }] });
await ok({ kind: "register_event", id: crypto.randomUUID(), shiftId, staffId: s.ali.id, at, type: "line_removed", lines: [{ productId: s.doner.id, name: "Döner", qtyMilli: 1000, total: 18000 }] });
// Adisyon iptali: olaylar doğrudan (applyTab kurallarından bağımsız sınanır)
const tabId = crypto.randomUUID(), lineId = crypto.randomUUID();
await withTenant(t.id, (tx) => tx.insert(schema.tabEvents).values([
  { id: crypto.randomUUID(), tenantId: t.id, storeId: s.store.id, tabId, staffId: s.ali.id, at: new Date(), type: "add", payload: { type: "add", lineId, productId: s.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null } },
  { id: crypto.randomUUID(), tenantId: t.id, storeId: s.store.id, tabId, staffId: s.ali.id, approvedBy: s.mudur.id, at: new Date(), type: "void", payload: { type: "void", lineId, reason: "yanlış masa" } },
]));
const r = { bas: istToday(), bit: istToday() };

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});

test("özet: brüt 385 − 25 = 360, önceki dönem 0, nakit para üstü (15) düşülmüş", async () => {
  const d = await withTenant(t.id, (tx) => summaryData(tx, r));
  assert.equal(d.now.gross, 36000);
  assert.equal(d.now.count, 1);
  assert.equal(d.before.gross, 0);
  assert.deepEqual(d.methods, [{ key: "nakit", label: "Nakit", amount: 36000 }]); // 400 − 15 üstü − 25 iade
});

test("yoğunluk + ürün + hiç satılmayan (hammadde hariç)", async () => {
  const h = await withTenant(t.id, (tx) => heatData(tx, r));
  assert.equal(h.max, 36000);
  const p = await withTenant(t.id, (tx) => productData(tx, r, "ciro"));
  assert.deepEqual(p.rows.map((x) => [x.name, x.qtyMilli, x.gross]), [["Döner", 2000, 36000], ["Ayran", 0, 0]]);
  assert.equal(p.categories[0].name, "Ana yemek");
  assert.deepEqual(p.unsold.map((x) => x.name), ["Künefe"]);
});

test("personel: iade, adisyon iptali, sepetten silme; olay listesi", async () => {
  const [ali] = await withTenant(t.id, (tx) => staffData(tx, r));
  assert.equal(ali.name, "Ali");
  assert.deepEqual([ali.gross, ali.refunds, ali.refundTotal, ali.voids, ali.voidTotal, ali.removed, ali.removedTotal], [38500, 1, 2500, 1, 18000, 1, 18000]);
  const { events, names } = await withTenant(t.id, (tx) => staffEvents(tx, r, s.ali.id));
  assert.deepEqual(events.map((e) => e.kind).sort(), ["iade", "iptal", "silme"]);
  assert.equal(names.get(s.mudur.id), "Müdür");
});

test("CSV: personel + bilinmeyen sekme + başka kiracı boş", async () => {
  const csv = await withTenant(t.id, (tx) => reportCsv(tx, "personel", r, null));
  assert.ok(csv!.startsWith("﻿Personel;"));
  assert.match(csv!, /Ali;385,00;1;/);
  assert.equal(await withTenant(t.id, (tx) => reportCsv(tx, "yok", r, null)), null);
  const empty = await withTenant(t2.id, (tx) => staffData(tx, r));
  assert.equal(empty.length, 0);
});
