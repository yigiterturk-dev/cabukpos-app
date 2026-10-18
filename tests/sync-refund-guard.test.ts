// tests/sync-refund-guard.test.ts — Derin tarama yamalarının eşitleme testleri:
// #1/#3 iade satırı asıl satışla eşlenir, #2 müdür onay belirteci, #6 cihaz saati geri kayması.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.AUTH_SECRET ||= "test-secret-0123456789abcdef0123456789abcdef";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { signJwt } = await import("@/lib/auth/jwt");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "GUARD-T", vertical: "market" }).returning();
const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Şube" }).returning();
  const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Kasiyer", pinHash: "x" }).returning();
  const [mudir] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  return { store, st, mudir, doner };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: setup.store.id, name: "Kasa G", receiptPrefix: "KG" }).returning();
const ctx = { tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, receiptPrefix: "KG" };
const shiftId = crypto.randomUUID();
await applyDoc(ctx, { kind: "shift_open", id: shiftId, staffId: setup.st.id, at: new Date().toISOString(), openingCash: 0 });
const now = () => new Date().toISOString();
let seq = 0;
const sale = (qtyMilli: number, over: Record<string, unknown> = {}) => ({
  kind: "sale", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, receiptSeq: ++seq, at: now(),
  lines: [{ productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli }],
  payments: [{ method: "nakit", amount: (18000 * qtyMilli) / 1000 }], ...over,
});
const refund = (refundOf: string, unitPrice: number, over: Record<string, unknown> = {}) => ({
  kind: "refund", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, approvedBy: setup.mudir.id, refundOf,
  receiptSeq: ++seq, at: now(),
  lines: [{ productId: setup.doner.id, name: "Döner", unitPrice, vatRate: 10, qtyMilli: 1000 }],
  payments: [{ method: "nakit", amount: unitPrice }], ...over,
});
const saleRow = (id: string) => withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id))).then((r) => r[0]);

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("#1: iade satırında uydurma birim fiyat → asıl satışta eşleşmez + ödeme eşleşmez review'ı", async () => {
  const s = sale(2000);
  assert.equal((await applyDoc(ctx, s)).ok, true);
  const r = await applyDoc(ctx, refund(s.id, 9_999_900));
  assert.equal(r.ok, true); // reddedilmez, incelemeye düşer
  const row = await saleRow(r.id);
  assert.ok(row.review?.includes("asıl satışta böyle bir satır yok"));
});

test("#1/#3: doğru fiyattan kısmi iade temiz geçer; satır indirimi sunucu tutarına yansır", async () => {
  // 1 adetlik satış, satır indirimi 2000 kuruş (lineTotal = 18000 − 2000 = 16000)
  const s = sale(1000, { lines: [{ productId: setup.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000, discount: 2000 }], payments: [{ method: "nakit", amount: 16000 }] });
  assert.equal((await applyDoc(ctx, s)).ok, true);
  // İade: cihaz indirimi BİLMESE de tam birim fiyatla gönderir → sunucu net tutarı (16000) bekler
  const r = await applyDoc(ctx, { ...refund(s.id, 18000), payments: [{ method: "nakit", amount: 16000 }] });
  assert.equal(r.ok, true);
  const row = await saleRow(r.id);
  assert.equal(row.review, null); // sunucu 16000 hesapladı, ödeme eşleşti, eşleşen satır var
});

test("#2: geçersiz onay belirteci review'a yazılır; doğru belirteç temiz geçirir", async () => {
  const s = sale(1000);
  await applyDoc(ctx, s);
  const bad = await applyDoc(ctx, refund(s.id, 18000, { approvalToken: "bu-bir-sahte-belirtecidir-123456" }));
  assert.ok((await saleRow(bad.id)).review?.includes("müdür onayı doğrulanamadı"));
  const s2 = sale(1000);
  await applyDoc(ctx, s2);
  const token = await signJwt("onay", { sub: setup.mudir.id, tid: t.id, did: dev.id }, 600);
  const good = await applyDoc(ctx, refund(s2.id, 18000, { approvalToken: token }));
  assert.equal((await saleRow(good.id)).review, null);
  // Başka cihazın belirteci de geçmez
  const s3 = sale(1000);
  await applyDoc(ctx, s3);
  const foreign = await signJwt("onay", { sub: setup.mudir.id, tid: t.id, did: crypto.randomUUID() }, 600);
  const f = await applyDoc(ctx, refund(s3.id, 18000, { approvalToken: foreign }));
  assert.ok((await saleRow(f.id)).review?.includes("müdür onayı doğrulanamadı"));
});

test("#6: saati geri kalan cihazın taze belgesi sunucu zamanına çekilir; gerçekten eski belge kendi zamanında kalır", async () => {
  const deviceNow = Date.now() - 3 * 60 * 60_000; // cihaz saati 3 saat geri
  const fresh = sale(1000, { at: new Date(deviceNow).toISOString() });
  const res = await applyDoc({ ...ctx, now: deviceNow }, fresh);
  assert.equal(res.ok, true);
  const row = await saleRow(fresh.id);
  assert.ok(row.review?.includes("cihaz saati geri"));
  assert.ok(Math.abs(row.createdAt.getTime() - Date.now()) < 5 * 60_000);
  // Uzun süredir çevrimdışı cihaz: saati doğru, belgesi 2 gün eski → zamana dokunulmaz
  const oldAt = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  const offline = sale(1000, { at: oldAt });
  assert.equal((await applyDoc({ ...ctx, now: Date.now() }, offline)).ok, true);
  const orow = await saleRow(offline.id);
  assert.equal(orow.review, null);
  assert.ok(Math.abs(orow.createdAt.getTime() - new Date(oldAt).getTime()) < 60_000);
});
