import { test, after } from "node:test";
import assert from "node:assert/strict";
import { lineShare, paidLinesOf, payableLines } from "@/lib/core/split";
import { totals } from "@/lib/core/cart";
import { foldTabs } from "@/lib/core/tab";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc, tabEventsOf } = await import("@/lib/sync/apply");
const { eq } = await import("drizzle-orm");
const [tenant] = await getDb().insert(schema.tenants).values({ name: "Product share test", vertical: "restoran" }).returning();
after(async () => { await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id)); await closeDb(); });
test("three fractional payments sync as clean sales: 100 cents collected, exact stock quantity and zero remaining", async () => {
  const f = await withTenant(tenant.id, async tx => {
    const [store] = await tx.insert(schema.stores).values({ tenantId: tenant.id, name: "Merkez" }).returning();
    const [staff] = await tx.insert(schema.staff).values({ tenantId: tenant.id, name: "Kasiyer", role: "kasiyer", pinHash: "test" }).returning();
    const [product] = await tx.insert(schema.products).values({ tenantId: tenant.id, name: "Paylaşılan ürün", price: 100, vatRate: 10, trackStock: true }).returning();
    return { store, staff, product };
  });
  const [device] = await getDb().insert(schema.devices).values({ tenantId: tenant.id, storeId: f.store.id, name: "Kasa", receiptPrefix: "SP" }).returning();
  const ctx = { tenantId: tenant.id, storeId: f.store.id, deviceId: device.id, receiptPrefix: "SP" };
  const at = () => new Date().toISOString();
  const shiftId = crypto.randomUUID(), tabId = crypto.randomUUID(), lineId = crypto.randomUUID();
  assert.equal((await applyDoc(ctx, { kind: "shift_open", id: shiftId, at: at(), staffId: f.staff.id, openingCash: 0 })).ok, true);
  for (const ev of [{ type: "open", kind: "masa", guests: 3 }, { type: "add", lineId, productId: f.product.id, name: f.product.name, unitPrice: 100, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null }]) assert.equal((await applyDoc(ctx, { kind: "tab", id: crypto.randomUUID(), tabId, tableId: null, staffId: f.staff.id, at: at(), approvedBy: null, ev })).ok, true);
  for (let left = 3; left > 0; left--) {
    const state = foldTabs(await withTenant(tenant.id, tx => tabEventsOf(tx, tabId))).get(tabId)!;
    const share = lineShare(payableLines(state)[0], left)!;
    const id = crypto.randomUUID();
    const { lineId: _lineId, ...line } = share; void _lineId;
    const sale = { kind: "sale", id, shiftId, staffId: f.staff.id, at: at(), receiptSeq: 4 - left, lines: [line], payments: [{ method: left === 3 ? "nakit" : "kart", amount: totals([share]).total }], tab: { tabId, tableId: null, paidLines: paidLinesOf([share]) } };
    assert.equal((await applyDoc(ctx, sale)).ok, true);
    assert.equal((await applyDoc(ctx, sale)).ok, true); // retry does not duplicate payment or stock
  }
  const data = await withTenant(tenant.id, async tx => ({ sales: await tx.select().from(schema.sales).where(eq(schema.sales.tabId, tabId)), lines: await tx.select().from(schema.saleLines).where(eq(schema.saleLines.productId, f.product.id)), stock: await tx.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, f.product.id)), events: await tabEventsOf(tx, tabId) }));
  assert.equal(data.sales.length, 3);
  assert.equal(data.sales.reduce((sum, s) => sum + s.total, 0), 100);
  assert.ok(data.sales.every(s => s.review === null));
  assert.equal(data.lines.reduce((sum, l) => sum + l.qtyMilli, 0), 1000);
  assert.equal(data.stock.reduce((sum, m) => sum + m.qtyMilli, 0), -1000);
  assert.equal(data.stock.length, 3);
  const tab = foldTabs(data.events).get(tabId)!;
  assert.equal(tab.remaining, 0); assert.equal(tab.closed, true);
});
