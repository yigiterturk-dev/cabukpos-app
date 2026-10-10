// tests/hq.test.ts — Zincir merkezi: şube başına ciro/kâr/iade + konsolide toplam; maliyetsiz satır işaretlenir.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { hqData } = await import("@/lib/admin/hq");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

test("hq: şube tablosu + konsolide; iade ciroya girmez, maliyet kârdan düşer", async () => {
  const [t] = await getDb().insert(schema.tenants).values({ name: "HQ-A", vertical: "restoran" }).returning();
  made.push(t.id);
  await withTenant(t.id, async (tx) => {
    const [a] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Kadıköy" }).returning();
    const [b] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Levent" }).returning();
    const [staff] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", pinHash: "x" }).returning();
    const mkSale = async (storeId: string, status: "kapandi" | "iade", total: number, lines: { total: number; cost: number | null }[]) => {
      const [device] = await tx.insert(schema.devices).values({ tenantId: t.id, storeId, name: "Kasa", receiptPrefix: "H" + crypto.randomUUID().slice(0, 4) }).returning();
      const [shift] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId, deviceId: device.id, openedBy: staff.id, openingCash: 0 }).returning();
      const [s] = await tx.insert(schema.sales).values({ id: crypto.randomUUID(), tenantId: t.id, storeId, deviceId: device.id, shiftId: shift.id, staffId: staff.id, receiptNo: "HQ-1", total, vat: [{ rate: 10, gross: total, net: total, vat: 0 }], status }).returning();
      for (const l of lines) await tx.insert(schema.saleLines).values({ tenantId: t.id, saleId: s.id, name: "x", unitPrice: l.total, vatRate: 10, qtyMilli: 1000, total: l.total, cost: l.cost });
    };
    await mkSale(a.id, "kapandi", 10_000, [{ total: 6_000, cost: 2_000 }, { total: 4_000, cost: null }]); // kâr 8.000, 1 maliyetsiz
    await mkSale(a.id, "iade", 3_000, [{ total: 3_000, cost: 1_000 }]); // iade: ciroya yok, kâra yok
    await mkSale(b.id, "kapandi", 20_000, [{ total: 20_000, cost: 5_000 }]); // kâr 15.000
  });
  const d = await withTenant(t.id, (tx) => hqData(tx, { bas: "2026-01-01", bit: "2030-01-01" }));
  const kadikoy = d.branches.find((b) => b.name === "Kadıköy")!, levent = d.branches.find((b) => b.name === "Levent")!;
  assert.equal(kadikoy.sales, 10_000);
  assert.equal(kadikoy.refunds, 3_000);
  assert.equal(kadikoy.count, 1);
  assert.equal(kadikoy.avg, 10_000);
  assert.equal(kadikoy.cost, 2_000); // iade satırının maliyeti kârdan düşmez (stok geri döner)
  assert.equal(kadikoy.profit, 8_000);
  assert.equal(kadikoy.noCost, 1);
  assert.equal(levent.sales, 20_000);
  assert.equal(levent.profit, 15_000);
  assert.equal(d.total.sales, 30_000);
  assert.equal(d.total.count, 2);
  assert.equal(d.total.avg, 15_000);
  assert.equal(d.total.refunds, 3_000);
});
