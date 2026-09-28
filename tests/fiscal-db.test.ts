// tests/fiscal-db.test.ts — cabukpos_test, uygulama rolü. Mali belge RLS'si, token fonksiyonu.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { newFiscalToken, NIHAI_TUKETICI } = await import("@/lib/core/fiscal");
const { eq, sql } = await import("drizzle-orm");
const { randomUUID } = await import("node:crypto");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

async function fixture(name: string) {
  const [t] = await getDb().insert(schema.tenants).values({ name, vertical: "restoran", taxId: "1234567890", taxOffice: "Kadıköy", address: "İstanbul" }).returning();
  made.push(t.id);
  const [st] = await withTenant(t.id, (tx) => tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez", address: "Moda Cd." }).returning());
  const [dv] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: st.id, name: "Kasa", receiptPrefix: "K1" }).returning();
  return withTenant(t.id, async (tx) => {
    const [kasiyer] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Kasiyer", role: "kasiyer", pinHash: "x" }).returning();
    const [sh] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId: st.id, deviceId: dv.id, openedBy: kasiyer.id, openingCash: 0 }).returning();
    return { t, st, dv, kasiyer, sh };
  });
}
type Fx = Awaited<ReturnType<typeof fixture>>;

async function rawSale(f: Fx, total = 2000) {
  const id = randomUUID();
  await withTenant(f.t.id, async (tx) => {
    await tx.insert(schema.sales).values({ id, tenantId: f.t.id, storeId: f.st.id, deviceId: f.dv.id, shiftId: f.sh.id, staffId: f.kasiyer.id, receiptNo: `K1-${id.slice(0, 6)}`, total, vat: [{ rate: 10, gross: total, net: 1818, vat: 182 }] });
    await tx.insert(schema.saleLines).values({ tenantId: f.t.id, saleId: id, name: "Çay", unitPrice: total, vatRate: 10, qtyMilli: 1000, total });
  });
  return id;
}

test("RLS: başka kiracının mali belgesi görünmez; token fonksiyonu bağlamsız çalışır", async () => {
  const a = await fixture("MALI-A"), b = await fixture("MALI-B");
  const saleA = await rawSale(a);
  const token = newFiscalToken();
  await withTenant(a.t.id, (tx) => tx.insert(schema.fiscalDocuments).values({ tenantId: a.t.id, saleId: saleA, buyer: NIHAI_TUKETICI, token }));
  assert.equal((await withTenant(a.t.id, (tx) => tx.select().from(schema.fiscalDocuments))).length, 1);
  assert.equal((await withTenant(b.t.id, (tx) => tx.select().from(schema.fiscalDocuments))).length, 0);
  assert.equal((await getDb().select().from(schema.fiscalDocuments)).length, 0);
  await assert.rejects(withTenant(b.t.id, (tx) => tx.insert(schema.fiscalDocuments).values({ tenantId: a.t.id, saleId: saleA, buyer: NIHAI_TUKETICI, token: newFiscalToken() })));

  const [row] = await getDb().execute(sql`select fiscal_doc_by_token(${token}) as d`) as unknown as { d: { status: string; seller: { taxId: string }; store: { address: string }; lines: unknown[]; sale: { total: number } } }[];
  assert.equal(row.d.status, "pending");
  assert.equal(row.d.seller.taxId, "1234567890");
  assert.equal(row.d.store.address, "Moda Cd.");
  assert.equal(row.d.lines.length, 1);
  assert.equal(row.d.sale.total, 2000);
  const [none] = await getDb().execute(sql`select fiscal_doc_by_token(${"x".repeat(24)}) as d`) as unknown as { d: unknown }[];
  assert.equal(none.d, null);

  const pend = await getDb().execute(sql`select * from fiscal_pending_tenants() as id`) as unknown as { id: string }[];
  assert.ok(pend.some((r) => r.id === a.t.id));
  assert.ok(!pend.some((r) => r.id === b.t.id));
});
