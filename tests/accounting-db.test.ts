// tests/accounting-db.test.ts — #20: DB'den ayın yevmiyesi (RLS'li satış/e-Arşiv/alım), e-Arşiv çifte sayım yok.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { monthlyAccountingJournal, istMonthRange } = await import("@/lib/admin/accounting");
const { and, eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "PKA-T", vertical: "market" }).returning();
const { start, end, startDay, endDay } = istMonthRange(2026, 9);
const inRange = (days: number) => new Date(start.getTime() + days * 24 * 3600_000);

await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [staff] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Kasiyer", role: "kasiyer", pinHash: "x" }).returning();
  const [device] = await tx.insert(schema.devices).values({ tenantId: t.id, storeId: store.id, name: "Kasa", receiptPrefix: "A" }).returning();
  const [shift] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId: store.id, deviceId: device.id, openedBy: staff.id, openedAt: inRange(0), openingCash: 0 }).returning();
  const sale = async (receiptNo: string, total: number, at: Date, status: "kapandi" | "iade" = "kapandi", refundOf: string | null = null) =>
    tx.insert(schema.sales).values({ id: crypto.randomUUID(), tenantId: t.id, storeId: store.id, deviceId: device.id, shiftId: shift.id, staffId: staff.id, receiptNo, total, vat: [{ rate: 10, gross: total, net: Math.round(total / 1.1), vat: total - Math.round(total / 1.1) }], status, refundOf, createdAt: at, syncedAt: at }).returning();
  const [pos] = await sale("A-1", 11000, inRange(1));
  const [es] = await sale("A-2", 22000, inRange(2));
  await sale("A-3", 5500, inRange(3), "iade", pos.id);
  await tx.insert(schema.fiscalDocuments).values({ tenantId: t.id, saleId: es.id, buyer: { taxId: "1234567801", name: "Anadolu A.Ş." }, ettn: crypto.randomUUID(), number: "CBP2026-1", token: crypto.randomUUID(), status: "issued", issuedAt: inRange(2) });
  const [supplier] = await tx.insert(schema.suppliers).values({ tenantId: t.id, name: "Toptancı" }).returning();
  await tx.insert(schema.purchases).values({ tenantId: t.id, storeId: store.id, supplierId: supplier.id, docNo: "AL-9", date: new Date(inRange(4).getTime() + 3 * 3600_000).toISOString().slice(0, 10), total: 9900 });
  // AL-10: satır KDV oranları dondurulmuş → yevmiyede 153 net + 191 KDV
  const [prod] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Un", price: 5000, vatRate: 10, trackStock: true }).returning();
  const [pu10] = await tx.insert(schema.purchases).values({ tenantId: t.id, storeId: store.id, supplierId: supplier.id, docNo: "AL-10", date: new Date(inRange(5).getTime() + 3 * 3600_000).toISOString().slice(0, 10), total: 11000 }).returning();
  await tx.insert(schema.purchaseLines).values({ tenantId: t.id, purchaseId: pu10.id, productId: prod.id, qtyMilli: 1000, unitCost: 11000, total: 11000, vatRate: 10 });
});

test("ay özeti: POS günü + e-Arşiv cari + iade + alım; e-Arşiv satışı POS'tan düşülür", async () => {
  const entries = await withTenant(t.id, (tx) => monthlyAccountingJournal(tx, { tenantId: t.id, year: 2026, month: 9, actor: "test" }));
  const desc = (s: string) => entries.find((e) => e.desc.includes(s))!;
  assert.ok(desc("Gün sonu"), "gün sonu fişi var");
  const day = desc("Gün sonu");
  assert.equal(day.lines.find((l) => l.code === "102")?.debit, 11000); // yalnız POS satışı; e-Arşiv 22.000 dahil değil
  assert.ok(desc("CBP2026-1"));
  assert.equal(desc("CBP2026-1").lines.find((l) => l.code === "120")?.debit, 22000);
  assert.equal(desc("A-3").lines.find((l) => l.code === "102")?.credit, 5500);
  assert.equal(desc("AL-9").lines.find((l) => l.code === "153")?.debit, 9900); // satırsız/eski fiş → 153'e toplam
  const al10 = desc("AL-10");
  assert.equal(al10.lines.find((l) => l.code === "153")?.debit, 10000); // 11000 net KDV %10
  assert.equal(al10.lines.find((l) => l.code === "191")?.debit, 1000);
  assert.equal(al10.lines.find((l) => l.code === "320")?.credit, 11000);
  for (const e of entries) assert.equal(e.lines.reduce((t2, l) => t2 + l.debit - l.credit, 0), 0);
});

test("aralık dışı kayıt girmez", async () => {
  await withTenant(t.id, async (tx) => {
    const [device] = await tx.select().from(schema.devices).limit(1);
    const [staff] = await tx.select().from(schema.staff).limit(1);
    const [shift] = await tx.select().from(schema.shifts).limit(1);
    await tx.insert(schema.sales).values({ id: crypto.randomUUID(), tenantId: t.id, storeId: device.storeId, deviceId: device.id, shiftId: shift.id, staffId: staff.id, receiptNo: "A-9", total: 99999, vat: [{ rate: 10, gross: 99999, net: 90909, vat: 9090 }], createdAt: new Date(end.getTime() + 24 * 3600_000), syncedAt: new Date(end.getTime() + 24 * 3600_000) });
  });
  const entries = await withTenant(t.id, (tx) => monthlyAccountingJournal(tx, { tenantId: t.id, year: 2026, month: 9, actor: "test" }));
  assert.ok(!entries.some((e) => e.lines.some((l) => l.debit === 99999 || l.credit === 99999)));
  void startDay; void endDay;
});

after(async () => {
  await withTenant(t.id, (tx) => tx.delete(schema.sales).where(and(eq(schema.sales.tenantId, t.id))));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});
