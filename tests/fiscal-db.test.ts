// tests/fiscal-db.test.ts — cabukpos_test, uygulama rolü. Mali belge RLS'si, token fonksiyonu.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { newFiscalToken, NIHAI_TUKETICI } = await import("@/lib/core/fiscal");
const { eq, sql } = await import("drizzle-orm");
const { applyDoc } = await import("@/lib/sync/apply");
const { issueOne, processDue, cancelOne } = await import("@/lib/fiscal/issue");
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
    const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
    const [sh] = await tx.insert(schema.shifts).values({ tenantId: t.id, storeId: st.id, deviceId: dv.id, openedBy: kasiyer.id, openingCash: 0 }).returning();
    return { t, st, dv, kasiyer, mudur, sh, ctx: { tenantId: t.id, storeId: st.id, deviceId: dv.id, receiptPrefix: "K1" }, seq: { n: 0 } };
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

  const [row] = await getDb().execute(sql`select fiscal_doc_by_token(${token}) as d`) as unknown as { d: { status: string; tenantId: string; seller: { taxId: string }; store: { address: string }; lines: unknown[]; sale: { total: number } } }[];
  assert.equal(row.d.status, "pending");
  assert.equal(row.d.tenantId, a.t.id);
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

test("#33: indirimli satış — token fonksiyonu indirimi taşır, kesim girdisi net KDV kırılımı alır", async () => {
  const f = await fixture("MALI-IND");
  const saleId = await rawSale(f);
  const token = newFiscalToken();
  await withTenant(f.t.id, async (tx) => {
    // 2000 brüt, 500 indirim → net 1500; matrah/KDV oransal nete düşer.
    await tx.update(schema.sales).set({ discount: 500, vat: [{ rate: 10, gross: 1500, net: 1364, vat: 136 }] }).where(eq(schema.sales.id, saleId));
    await tx.insert(schema.fiscalDocuments).values({ tenantId: f.t.id, saleId, buyer: NIHAI_TUKETICI, token });
  });
  const [row] = await getDb().execute(sql`select fiscal_doc_by_token(${token}) as d`) as unknown as { d: { sale: { total: number; discount: number } } }[];
  assert.equal(row.d.sale.discount, 500);
  assert.equal(row.d.sale.total, 2000);
  const out = await issueOne(f.t.id, saleId, { force: true });
  assert.equal(out?.status, "issued");
});

const line = (total: number) => ({ productId: null, name: "Çay", unitPrice: total, vatRate: 10, qtyMilli: 1000 });
async function sync(f: Fx, extra: Record<string, unknown> = {}, total = 2000) {
  const id = randomUUID();
  const r = await applyDoc(f.ctx, { kind: "sale", id, shiftId: f.sh.id, staffId: f.kasiyer.id, receiptSeq: ++f.seq.n, at: new Date().toISOString(), lines: [line(total)], payments: [{ method: "nakit", amount: total }], ...extra });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}
async function refund(f: Fx, saleId: string, total: number) {
  const id = randomUUID();
  const r = await applyDoc(f.ctx, { kind: "refund", id, shiftId: f.sh.id, staffId: f.kasiyer.id, approvedBy: f.mudur.id, refundOf: saleId, receiptSeq: ++f.seq.n, at: new Date().toISOString(), lines: [line(total)], payments: [{ method: "nakit", amount: total }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}
const refundsOf = async (f: Fx, docId: string) => withTenant(f.t.id, (tx) => tx.select().from(schema.fiscalRefunds).where(eq(schema.fiscalRefunds.fiscalDocId, docId)).orderBy(schema.fiscalRefunds.createdAt));
const docOf = async (f: Fx, saleId: string) => (await withTenant(f.t.id, (tx) => tx.select().from(schema.fiscalDocuments).where(eq(schema.fiscalDocuments.saleId, saleId))))[0];
const setFs = (f: Fx, v: Partial<typeof schema.fiscalSettings.$inferInsert>) => withTenant(f.t.id, (tx) => tx.insert(schema.fiscalSettings).values({ tenantId: f.t.id, ...v }).onConflictDoUpdate({ target: schema.fiscalSettings.tenantId, set: v }));
const year = new Date().getFullYear();
const VKN_BUYER = { taxId: "1234567890", name: "Acme Ltd", address: "Ankara", email: "muhasebe@acme.test" };

test("kesim: paket kanalı, fatura isteği, info kanal, idempotent, sıralı numara", async () => {
  const f = await fixture("MALI-KES");
  await setFs(f, { channelModes: { kasa: "info", masa: "info", paket: "earsiv", platform: "info" } });
  const tabId = randomUUID();
  assert.equal((await applyDoc(f.ctx, { kind: "tab", id: randomUUID(), tabId, tableId: null, at: new Date().toISOString(), staffId: f.kasiyer.id, approvedBy: null, ev: { type: "open", guests: 0, kind: "paket" } })).ok, true);
  const paket = await sync(f, { tab: { tabId, tableId: null, paidLines: [{ lineId: randomUUID(), qtyMilli: 1000, discount: 0 }] } });
  assert.equal((await docOf(f, paket)).status, "pending");
  await processDue(f.t.id); // taze belge kasanın doğrudan isteğine bırakılır
  assert.equal((await docOf(f, paket)).status, "pending");
  const r1 = await issueOne(f.t.id, paket);
  assert.equal(r1?.status, "issued");
  assert.equal(r1?.number, `CBP${year}000000001`);
  assert.match(r1!.ettn!, /^[0-9a-f-]{36}$/);

  assert.equal(await docOf(f, await sync(f)), undefined); // kasa = info, istek yok
  const token = newFiscalToken();
  const kasa = await sync(f, { fiscal: { token, buyer: VKN_BUYER } });
  const d = await docOf(f, kasa);
  assert.deepEqual([d.status, d.token, d.buyer.taxId], ["pending", token, "1234567890"]);
  // aynı satış ikinci kez → tek belge, token değişmez
  const again = await applyDoc(f.ctx, { kind: "sale", id: kasa, shiftId: f.sh.id, staffId: f.kasiyer.id, receiptSeq: f.seq.n, at: new Date().toISOString(), lines: [line(2000)], payments: [{ method: "nakit", amount: 2000 }], fiscal: { token: newFiscalToken(), buyer: VKN_BUYER } });
  assert.equal(again.ok, true);
  assert.equal((await docOf(f, kasa)).token, token);
  assert.equal((await issueOne(f.t.id, kasa))?.number, `CBP${year}000000002`);
  assert.equal((await issueOne(f.t.id, kasa))?.number, `CBP${year}000000002`); // kesilmişe tekrar → aynı
});

test("hata: simülasyon sayaç yakmaz, vade, retryable:false, eşzamanlı tek numara", async () => {
  const f = await fixture("MALI-HATA");
  await setFs(f, { channelModes: { kasa: "earsiv", masa: "info", paket: "info", platform: "info" }, fakeFail: true });
  const s1 = await sync(f);
  assert.equal((await issueOne(f.t.id, s1))?.status, "error");
  let d = await docOf(f, s1);
  assert.equal(d.attempts, 1);
  assert.equal((await withTenant(f.t.id, (tx) => tx.select().from(schema.fiscalSettings)))[0].counter, 0);
  await setFs(f, { fakeFail: false });
  await processDue(f.t.id); // vade (1 dk) gelmedi → atlanır
  assert.equal((await docOf(f, s1)).status, "error");
  await processDue(f.t.id, 5, new Date(Date.now() + 61_000));
  d = await docOf(f, s1);
  assert.deepEqual([d.status, d.number, d.attempts], ["issued", `CBP${year}000000001`, 2]);

  const s2 = await sync(f);
  const [a, b] = await Promise.all([issueOne(f.t.id, s2), issueOne(f.t.id, s2)]);
  assert.equal(a?.number, b?.number);
  assert.equal(a?.number, `CBP${year}000000002`);
  assert.equal((await withTenant(f.t.id, (tx) => tx.select().from(schema.fiscalSettings)))[0].counter, 2);

  await getDb().update(schema.tenants).set({ taxId: null }).where(eq(schema.tenants.id, f.t.id));
  const s3 = await sync(f);
  assert.equal((await issueOne(f.t.id, s3))?.status, "error");
  d = await docOf(f, s3);
  assert.deepEqual([d.attempts, d.lastError], [5, "İşletme vergi bilgisi eksik"]);
  await processDue(f.t.id, 5, new Date(Date.now() + 86_400_000));
  assert.equal((await docOf(f, s3)).attempts, 5); // otomatik deneme yok
});

test("iade: tam → cancelled, kısmi → tutanak/alıcı faturası kaydı, 8 gün → cancel_rejected + tutanak, kesilmeden tam → cancelled", async () => {
  const f = await fixture("MALI-IADE");
  await setFs(f, { channelModes: { kasa: "earsiv", masa: "info", paket: "info", platform: "info" } });
  const full = await sync(f, {}, 3000);
  await issueOne(f.t.id, full);
  await refund(f, full, 3000);
  assert.equal((await docOf(f, full)).cancelPending, true);
  await processDue(f.t.id);
  assert.equal((await docOf(f, full)).status, "cancelled");

  const part = await sync(f, {}, 3000);
  await issueOne(f.t.id, part);
  const r1 = await refund(f, part, 1000);
  const p = await docOf(f, part);
  assert.deepEqual([p.status, p.cancelPending], ["issued", false]);
  const fr = await refundsOf(f, p.id);
  assert.deepEqual(fr.map((x) => [x.refundSaleId, x.kind, !!x.resolvedAt]), [[r1, "tutanak", true]]);
  await refund(f, part, 2000); // kalan tamamı: önceki iade var → yine kısmi, iptal yok
  assert.equal((await docOf(f, part)).cancelPending, false);
  assert.equal((await refundsOf(f, p.id)).length, 2);

  const vkn = await sync(f, { fiscal: { token: newFiscalToken(), buyer: VKN_BUYER } }, 3000);
  await issueOne(f.t.id, vkn);
  await refund(f, vkn, 1000);
  const [v] = await refundsOf(f, (await docOf(f, vkn)).id);
  assert.deepEqual([v.kind, v.resolvedAt], ["alici_faturasi", null]);

  const old = await sync(f, {}, 3000);
  await issueOne(f.t.id, old);
  await withTenant(f.t.id, (tx) => tx.update(schema.fiscalDocuments).set({ issuedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(schema.fiscalDocuments.saleId, old)));
  await refund(f, old, 3000);
  await cancelOne(f.t.id, (await docOf(f, old)).id);
  const o = await docOf(f, old);
  assert.deepEqual([o.status, o.lastError], ["cancel_rejected", "İptal süresi geçti"]);
  assert.deepEqual((await refundsOf(f, o.id)).map((x) => x.kind), ["tutanak"]);

  await setFs(f, { fakeFail: true });
  const unissued = await sync(f, {}, 3000);
  await issueOne(f.t.id, unissued);
  await refund(f, unissued, 3000);
  assert.equal((await docOf(f, unissued)).status, "cancelled");
});

test("zorlanmayan çağrı 10 sn içinde yeniden denemez; force dener", async () => {
  const f = await fixture("MALI-YAKIN");
  await setFs(f, { channelModes: { kasa: "earsiv", masa: "info", paket: "info", platform: "info" }, fakeFail: true });
  const s1 = await sync(f);
  assert.equal((await issueOne(f.t.id, s1))?.status, "error");
  await setFs(f, { fakeFail: false });
  assert.equal((await issueOne(f.t.id, s1))?.status, "error"); // push sonrası + kasa çakışması: tek deneme
  assert.equal((await docOf(f, s1)).attempts, 1);
  assert.equal((await issueOne(f.t.id, s1, { force: true }))?.status, "issued");
});
