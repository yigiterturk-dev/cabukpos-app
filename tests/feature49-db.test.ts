// tests/feature49-db.test.ts — #49: bahşiş satışı (DB) + rezervasyon RLS/yaşam döngüsü.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { applyDoc } = await import("@/lib/sync/apply");
const { timeToAt, validateReservation } = await import("@/lib/core/reservation");
const { randomUUID } = await import("node:crypto");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

async function fixture(name: string) {
  const [t] = await getDb().insert(schema.tenants).values({ name, vertical: "restoran" }).returning();
  made.push(t.id);
  const [st] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning());
  const [dv] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: st.id, name: "Kasa", receiptPrefix: "K1" }).returning();
  return withTenant(t.id, async (tx) => {
    const [k] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "K", role: "kasiyer", pinHash: "x" }).returning();
    const [sh] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId: st.id, deviceId: dv.id, openedBy: k.id, openingCash: 0 }).returning();
    return { t, st, dv, k, sh, ctx: { tenantId: t.id, storeId: st.id, deviceId: dv.id, receiptPrefix: "K1" } };
  });
}

test("bahşiş: satış toplamı bahşişli, payments farkı öder; tip kolonu yazılır", async () => {
  const f = await fixture("TIP");
  const id = randomUUID();
  const res = await applyDoc(f.ctx, {
    kind: "sale", id, shiftId: f.sh.id, staffId: f.k.id, receiptSeq: 1, at: new Date().toISOString(),
    lines: [{ lineId: randomUUID(), productId: null, name: "Kahve", unitPrice: 8000, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null, discount: 0 }],
    payments: [{ method: "kart", amount: 9_000 }],
    tip: 1_000,
  });
  assert.ok(res.ok, res.ok ? undefined : (res as { error?: string }).error);
  const [sale] = await withTenant(f.t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id)));
  assert.equal(sale.tip, 1_000);
  assert.equal(sale.total, 9_000); // 8000 + 1000
  assert.equal(sale.change, 0);
});

test("bahşişsiz eski belge: tip 0, toplam değişmez (geriye dönük)", async () => {
  const f = await fixture("TIP0");
  const id = randomUUID();
  const res = await applyDoc(f.ctx, {
    kind: "sale", id, shiftId: f.sh.id, staffId: f.k.id, receiptSeq: 1, at: new Date().toISOString(),
    lines: [{ lineId: randomUUID(), productId: null, name: "Çay", unitPrice: 3000, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null, discount: 0 }],
    payments: [{ method: "nakit", amount: 5_000 }],
  });
  assert.ok(res.ok, res.ok ? undefined : (res as { error?: string }).error);
  const [sale] = await withTenant(f.t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id)));
  assert.equal(sale.tip, 0);
  assert.equal(sale.total, 3_000);
  assert.equal(sale.change, 2_000);
});

test("masa birleştirme: iki adisyon olayı bulutta uygulanır, kaynak kapanır", async () => {
  const f = await fixture("MERGE");
  const at = new Date().toISOString();
  const line = (n: string, p: number) => ({ lineId: randomUUID(), productId: null, name: n, unitPrice: p, vatRate: 10 as const, qtyMilli: 1000, options: [], note: null, stationId: null });
  // Kaynak adisyon: 1 çay
  const srcTab = randomUUID(), srcLine = randomUUID();
  for (const [, e] of [
    { type: "open", guests: 2 }, { type: "add", lineId: srcLine, productId: null, name: "Çay", unitPrice: 5000, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null },
  ].entries()) {
    const res = await applyDoc(f.ctx, { kind: "tab", id: randomUUID(), tabId: srcTab, tableId: null, at, staffId: f.k.id, approvedBy: null, ev: e as never });
    assert.ok(res.ok, res.ok ? undefined : (res as { error?: string }).error);
  }
  // Hedef adisyon: merge + kaynak merge_away (sunucu ikisini de yazar — hedef belgesi üzerinden)
  const dstTab = randomUUID();
  const dstLine = line("Kahve", 8000);
  const res = await applyDoc(f.ctx, {
    kind: "tab", id: randomUUID(), tabId: dstTab, tableId: null, at, staffId: f.k.id, approvedBy: null,
    ev: { type: "merge", fromTabId: srcTab, lines: [{ lineId: srcLine, productId: null, name: "Çay", unitPrice: 5000, vatRate: 10 as const, qtyMilli: 1000, options: [], note: null, stationId: null }] },
  });
  assert.ok(res.ok, res.ok ? undefined : (res as { error?: string }).error);
  const evs = await withTenant(f.t.id, (tx) => tx.select().from(schema.tabEvents));
  assert.ok(evs.some((e) => e.tabId === dstTab && (e.payload as { type: string }).type === "merge"));
  assert.ok(evs.some((e) => e.tabId === srcTab && (e.payload as { type: string }).type === "merge_away"));
  void dstLine;
});

test("rezervasyon: RLS izolasyonu + doğrulama + saat dönüşümü", async () => {
  const a = await fixture("RES-A"), b = await fixture("RES-B");
  const at = timeToAt("2026-10-05", "19:30")!;
  assert.ok(at);
  assert.equal(timeToAt("2026-10-05", "25:00"), null);
  assert.equal(validateReservation({ name: "Ali", phone: "5551234567", guests: 4, note: "" }), null);
  assert.ok(validateReservation({ name: "Ali", phone: "abc", guests: 4, note: "" }));
  assert.ok(validateReservation({ name: "Ali", phone: "5551234567", guests: 0, note: "" }));
  await withTenant(a.t.id, (tx) => tx.insert(schema.reservations).values({ tenantId: a.t.id, storeId: a.st.id, name: "Ali", phone: "5551234567", guests: 4, at }));
  assert.equal((await withTenant(a.t.id, (tx) => tx.select().from(schema.reservations))).length, 1);
  assert.equal((await withTenant(b.t.id, (tx) => tx.select().from(schema.reservations))).length, 0); // RLS
  const [row] = await withTenant(a.t.id, (tx) => tx.update(schema.reservations).set({ status: "onaylandi" }).returning());
  assert.equal(row.status, "onaylandi");
});
