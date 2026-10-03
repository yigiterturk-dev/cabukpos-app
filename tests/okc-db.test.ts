// tests/okc-db.test.ts — #18 ÖKC DB akışı: künyeleme, sayaç, idempotentlik, hata simülasyonu, kiracı ayrımı.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { okcReceiptFor, getOkc } = await import("@/lib/fiscal/okc");
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
    const [kasiyer] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "K", role: "kasiyer", pinHash: "x" }).returning();
    const [sh] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId: st.id, deviceId: dv.id, openedBy: kasiyer.id, openingCash: 0 }).returning();
    return { t, st, dv, kasiyer, sh };
  });
}

async function rawSale(f: Awaited<ReturnType<typeof fixture>>, total = 1500) {
  const id = randomUUID();
  await withTenant(f.t.id, async (tx) => {
    await tx.insert(schema.sales).values({ id, tenantId: f.t.id, storeId: f.st.id, deviceId: f.dv.id, shiftId: f.sh.id, staffId: f.kasiyer.id, receiptNo: `K1-${id.slice(0, 6)}`, total, vat: [{ rate: 10, gross: total, net: 1364, vat: 136 }] });
    await tx.insert(schema.payments).values({ tenantId: f.t.id, saleId: id, method: "nakit", amount: total });
  });
  return id;
}

const enable = (tenantId: string, fakeFail = false) =>
  withTenant(tenantId, (tx) => tx.insert(schema.fiscalSettings).values({ tenantId, okcProvider: "fake-okc", okcSerial: "TRA123456", okcFakeFail: fakeFail })
    .onConflictDoUpdate({ target: schema.fiscalSettings.tenantId, set: { okcProvider: "fake-okc", okcSerial: "TRA123456", okcFakeFail: fakeFail } }));

test("ÖKC: künyeleme, sayaç artışı, idempotentlik; kapalıyken dokunulmaz", async () => {
  const f = await fixture("OKC-A");
  const s1 = await rawSale(f);
  assert.equal(await okcReceiptFor(f.t.id, s1), null); // kapalı
  await enable(f.t.id);
  const r1 = await okcReceiptFor(f.t.id, s1);
  assert.equal(r1?.status, "ok");
  const [sale] = await withTenant(f.t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, s1)));
  assert.match(sale.okc!.no, /^TRA123456-\d{4}-000001$/);
  assert.equal(sale.okc!.test, true);
  assert.deepEqual(await okcReceiptFor(f.t.id, s1), null); // ikinci çağrı dokunmaz
  const s2 = await rawSale(f);
  const r2 = await okcReceiptFor(f.t.id, s2);
  assert.match(r2!.data!.no, /-000002$/); // sayaç monoton
});

test("ÖKC: hata simülasyonu numarayı yakmaz, satır boş kalır", async () => {
  const f = await fixture("OKC-B");
  await enable(f.t.id, true);
  const id = await rawSale(f);
  const r = await okcReceiptFor(f.t.id, id);
  assert.equal(r?.status, "error");
  const [sale] = await withTenant(f.t.id, (tx) => tx.select({ okc: schema.sales.okc }).from(schema.sales).where(eq(schema.sales.id, id)));
  assert.equal(sale.okc, null);
  const [cnt] = await withTenant(f.t.id, (tx) => tx.select({ c: schema.fiscalSettings.okcCounter }).from(schema.fiscalSettings));
  assert.equal(cnt.c, 0); // geri sarıldı
});

test("ÖKC: iade satışı künyelenmez; fake cancel davranışı", async () => {
  const f = await fixture("OKC-C");
  await enable(f.t.id);
  const orig = await rawSale(f);
  await okcReceiptFor(f.t.id, orig);
  const ref = randomUUID();
  await withTenant(f.t.id, async (tx) => {
    await tx.insert(schema.sales).values({ id: ref, tenantId: f.t.id, storeId: f.st.id, deviceId: f.dv.id, shiftId: f.sh.id, staffId: f.kasiyer.id, receiptNo: `K1-${ref.slice(0, 6)}`, total: -1500, status: "iade", refundOf: orig, vat: [] });
  });
  assert.equal(await okcReceiptFor(f.t.id, ref), null); // status iade → dokunulmaz
  const p = getOkc("fake-okc", { fakeFail: false });
  assert.deepEqual(await p.cancel("X", new Date()), { ok: true });
  const bad = getOkc("fake-okc", { fakeFail: true });
  const c = await bad.receipt({ serial: "TRA123456", seq: 1, receiptNo: "x", total: 1, vat: [], payments: [], soldAt: new Date() });
  assert.equal(c.ok, false);
});
