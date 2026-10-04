// tests/rfm-db.test.ts — #40: telefon→müşteri bağlantısı, RFM satırları, CSV sekmesi (RLS).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { rfmData } = await import("@/lib/admin/rfm");
const { reportCsv } = await import("@/lib/admin/report");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

test("rfm: paket sipariş telefonundan RFM satırı + kohort + CSV", async () => {
  const [t] = await getDb().insert(schema.tenants).values({ name: "RFM", vertical: "restoran" }).returning();
  made.push(t.id);
  const [st] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "S" }).returning());
  const [dv] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: st.id, name: "K", receiptPrefix: "R1" }).returning();
  const [k] = await withTenant(t.id, (tx) => tx.insert(schema.staff).values({ tenantId: t.id, name: "K", role: "kasiyer", pinHash: "x" }).returning());
  const [sh] = await withTenant(t.id, (tx) => tx.insert(schema.shifts).values({ tenantId: t.id, storeId: st.id, deviceId: dv.id, openedBy: k.id, openingCash: 0 }).returning());

  // Müşteri + iki paket adisyonu (sipariş olayı telefon taşır), biri bu ay biri geçen ay
  await withTenant(t.id, (tx) => tx.insert(schema.customers).values({ tenantId: t.id, phone: "905551112233", name: "Ali Veli" }));
  const tab1 = crypto.randomUUID(), tab2 = crypto.randomUUID();
  const now = new Date();
  const lastMonth = new Date(now.getTime() - 35 * 86_400_000);
  const orderEv = () => ({ type: "order", phone: "0555 111 22 33", name: "Ali Veli", address: "X Sk.", directions: null, zoneId: null });
  await withTenant(t.id, (tx) => tx.insert(schema.tabEvents).values([
    { id: crypto.randomUUID(), tenantId: t.id, storeId: st.id, tabId: tab1, at: lastMonth, staffId: k.id, type: "order", payload: orderEv() },
    { id: crypto.randomUUID(), tenantId: t.id, storeId: st.id, tabId: tab2, at: now, staffId: k.id, type: "order", payload: orderEv() },
  ]));
  const sale = (tabId: string, total: number, at: Date, seq: number) => ({ id: crypto.randomUUID(), tenantId: t.id, storeId: st.id, deviceId: dv.id, shiftId: sh.id, staffId: k.id, receiptNo: `R1-00000${seq}`, channel: "paket" as const, status: "kapandi" as const, total, vat: [], tabId, createdAt: at, syncedAt: at });
  await withTenant(t.id, (tx) => tx.insert(schema.sales).values([sale(tab1, 10_000, lastMonth, 1), sale(tab2, 15_000, now, 2)]));

  const data = await withTenant(t.id, (tx) => rfmData(tx, t.id));
  assert.equal(data.summary.total, 1);
  assert.equal(data.rows.length, 1);
  const row = data.rows[0];
  assert.equal(row.name, "Ali Veli");
  assert.equal(row.orders, 2);
  assert.equal(row.spend, 25_000);
  assert.equal(row.segment, "Yeni"); // son sipariş ≤7 gün, sipariş <5
  const kohortSon = data.cohorts.at(-1)!;
  assert.ok(kohortSon.size >= 1);
  assert.equal(kohortSon.cells[0].ordered, 1);

  const csv = await withTenant(t.id, (tx) => reportCsv(tx, t.id, "musteriler", { bas: "2026-01-01", bit: "2026-12-31" }, null));
  assert.ok(csv!.includes("Ali Veli"));
  assert.ok(csv!.includes("05551112233"));
});
