// tests/delivery-db.test.ts — cabukpos_test, uygulama rolü. M6: masasız paket adisyonu, müşteri defteri, serbest satır, kanal,
// müdürsüz iptal → review, platform webhook'u (imza, idempotens, otomatik kabul → bildirim audit'i), müşteri araması.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc, tabEventsOf } = await import("@/lib/sync/apply");
const { foldTabs, deliveryStatus } = await import("@/lib/core/tab");
const { lookupCustomer } = await import("@/lib/delivery/customers");
const { mockSource, sign } = await import("@/lib/platform/mock");
const { ingestOrders } = await import("@/lib/platform/ingest");
const { provisionConnection } = await import("@/lib/platform/provision");
const { notifyPlatform, notifyPlatformStatus } = await import("@/lib/platform/notify");
const { and, eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "PKT-T", vertical: "restoran" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [kasiyer] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Kasiyer", role: "kasiyer", pinHash: "x" }).returning();
  const [kurye] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Kurye", role: "kurye", pinHash: "x" }).returning();
  const [lah] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Lahmacun", price: 6000, vatRate: 10 }).returning();
  const [zone] = await tx.insert(schema.deliveryZones).values({ tenantId: t.id, storeId: store.id, name: "Merkez", fee: 1500, minOrder: 10000 }).returning();
  const [area] = await tx.insert(schema.areas).values({ tenantId: t.id, storeId: store.id, name: "Salon" }).returning();
  const [m1] = await tx.insert(schema.tables).values({ tenantId: t.id, areaId: area.id, name: "M1" }).returning();
  await tx.insert(schema.productPlatformCodes).values({ tenantId: t.id, storeId: store.id, platform: "mock", code: "LAH", productId: lah.id });
  return { store, kasiyer, kurye, lah, zone, m1 };
});
const [kasaDev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kasa", receiptPrefix: "K1" }).returning();
const [kuryeDev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kurye", receiptPrefix: "R1", role: "kurye" }).returning();
const kasa = { tenantId: t.id, storeId: s.store.id, deviceId: kasaDev.id, receiptPrefix: "K1" };
const kuryeCtx = { tenantId: t.id, storeId: s.store.id, deviceId: kuryeDev.id, receiptPrefix: "R1" };
const conn = await provisionConnection(t.id, s.store.id, "mock", "test:admin");
assert.ok(conn);
const connObj = conn;

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

const now = () => new Date().toISOString();
const doc = (tabId: string, ev: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  ({ kind: "tab", id: crypto.randomUUID(), tabId, tableId: null, at: now(), staffId: s.kasiyer.id, approvedBy: null, ev, ...over });
const orderEv = (address = "Atatürk Cad. 5") =>
  ({ type: "order", customerId: null, name: "Ayşe", phone: "905321234567", address, directions: "Eczane üstü", zoneId: s.zone.id, note: null, payIntent: "nakit", promisedAt: null, source: null });
const lineEv = (lineId: string) => ({ type: "add", lineId, productId: s.lah.id, name: "Lahmacun", unitPrice: 6000, vatRate: 10, qtyMilli: 2000, options: [], note: null, stationId: null });
const feeEv = (lineId: string) => ({ type: "add", lineId, productId: null, name: "Paket servis ücreti", unitPrice: 1500, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null });
const reviewOf = async (id: string) => (await withTenant(t.id, (tx) => tx.select({ r: schema.tabEvents.review }).from(schema.tabEvents).where(eq(schema.tabEvents.id, id))))[0]?.r ?? null;

const incoming = (externalId: string) => ({ externalId, customer: { name: "Demo", phone: "05550000111" }, address: "Örnek", directions: null, note: null, payIntent: "online" as const, deadline: null, lines: [{ code: "LAH", name: "Lahmacun", unitPrice: 6500, qtyMilli: 1000, note: null }] });
const orderEvents = (storeId: string, externalId: string) => withTenant(t.id, async (tx) => {
  const E = schema.tabEvents;
  const orders = await tx.select().from(E).where(and(eq(E.storeId, storeId), eq(E.type, "order")));
  const order = orders.find(r => (r.payload as { source?: { externalId: string } }).source?.externalId === externalId)!;
  return tx.select().from(E).where(eq(E.tabId, order.tabId)).orderBy(E.at, E.id);
});

test("başarısız otomatik kabul tekrar webhook'ta düzelir; sipariş ve mutfak bileti çoğalmaz", async () => {
  const order = incoming("RETRY-1");
  process.env.MOCK_PLATFORM_FAIL = "1";
  try { await ingestOrders(connObj, [order]); } finally { delete process.env.MOCK_PLATFORM_FAIL; }
  const before = await orderEvents(s.store.id, order.externalId);
  const accept = before.find(e => e.type === "accept")!;
  assert.match(String(accept.review), /platform bildirimi başarısız/);
  assert.deepEqual(await ingestOrders(connObj, [order]), { created: 0, duplicates: 1, unmapped: 0 });
  const after = await orderEvents(s.store.id, order.externalId);
  assert.equal(after.length, before.length);
  assert.equal(after.filter(e => e.type === "send").length, 1);
  assert.equal(await reviewOf(accept.id), null);
  await ingestOrders(connObj, [order]);
  const audits = await withTenant(t.id, tx => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.accept")));
  assert.equal(audits.filter(a => (a.detail as { tabId?: string }).tabId === accept.tabId).length, 1);
});

test("tekrar webhook elle onay bekleyen siparişi kabul etmez; iptal edilmiş paketi canlandırmaz", async () => {
  const order = incoming("RETRY-MANUAL");
  await ingestOrders({ ...connObj, autoAccept: false }, [order]);
  await ingestOrders(connObj, [order]);
  assert.equal((await orderEvents(s.store.id, order.externalId)).filter(e => e.type === "accept").length, 0);
  const cancelled = incoming("RETRY-CANCELLED");
  process.env.MOCK_PLATFORM_FAIL = "1";
  try { await ingestOrders(connObj, [cancelled]); } finally { delete process.env.MOCK_PLATFORM_FAIL; }
  const rows = await orderEvents(s.store.id, cancelled.externalId);
  const acc = rows.find(e => e.type === "accept")!;
  await withTenant(t.id, tx => tx.insert(schema.tabEvents).values({ id: crypto.randomUUID(), tenantId: t.id, storeId: s.store.id, tabId: acc.tabId, at: new Date(Date.now() + 100), type: "cancel", payload: { type: "cancel", reason: "Vazgeçildi" } }));
  await ingestOrders(connObj, [cancelled]);
  assert.match(String(await reviewOf(acc.id)), /platform bildirimi başarısız/);
  const audits = await withTenant(t.id, tx => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.accept")));
  assert.equal(audits.filter(a => (a.detail as { tabId?: string }).tabId === acc.tabId).length, 0);
});

test("aynı dış numara farklı şubelerde kabul ve durum bildirimlerini engellemez", async () => {
  const [store] = await withTenant(t.id, tx => tx.insert(schema.stores).values({ tenantId: t.id, name: "Diğer şube" }).returning());
  const other = await provisionConnection(t.id, store.id, "mock", "test:admin");
  assert.ok(other);
  const order = incoming("SHARED-EXT-1");
  await ingestOrders(connObj, [order]);
  await ingestOrders(other, [order]);
  const first = (await orderEvents(s.store.id, order.externalId))[0];
  const second = (await orderEvents(store.id, order.externalId))[0];
  for (const [tabId, storeId] of [[first.tabId, s.store.id], [second.tabId, store.id]]) {
    const id = crypto.randomUUID();
    await withTenant(t.id, tx => tx.insert(schema.tabEvents).values({ id, tenantId: t.id, storeId, tabId, at: new Date(Date.now() + 100), type: "out", payload: { type: "out" } }));
    await notifyPlatformStatus(t.id, id, tabId, "picked");
    await notifyPlatformStatus(t.id, id, tabId, "picked");
  }
  const audits = await withTenant(t.id, tx => tx.select().from(schema.auditLog));
  for (const tabId of [first.tabId, second.tabId]) {
    const scoped = audits.filter(a => (a.detail as { tabId?: string }).tabId === tabId);
    assert.equal(scoped.filter(a => a.action === "platform.accept").length, 1);
    assert.equal(scoped.filter(a => a.action === "platform.status").length, 1);
  }
  // An unrelated event ID must not be used to acknowledge another tab.
  await notifyPlatform(t.id, first.id, second.tabId, { type: "accept", prepMin: 20 });
  assert.equal(await reviewOf(first.id), null);
});

test("yeni bağlantı otomatik kabul eder; tekrar bağlama mevcut tercihi korur; başka kiracının şubesi bağlanamaz", async () => {
  assert.equal(connObj.autoAccept, true);
  const P = schema.platformConnections;
  await getDb().update(P).set({ autoAccept: false }).where(and(eq(P.id, connObj.id), eq(P.tenantId, t.id)));
  try {
    assert.equal(await provisionConnection(t.id, s.store.id, "mock", "test:admin"), null);
    const [saved] = await getDb().select({ autoAccept: P.autoAccept }).from(P).where(and(eq(P.id, connObj.id), eq(P.tenantId, t.id)));
    assert.equal(saved.autoAccept, false);
    const [other] = await getDb().insert(schema.tenants).values({ name: "PKT-other", vertical: "restoran" }).returning();
    try {
      await assert.rejects(provisionConnection(other.id, s.store.id, "mock", "test:admin"), /Şube bulunamadı/);
    } finally {
      await getDb().delete(schema.tenants).where(eq(schema.tenants.id, other.id));
    }
  } finally {
    await getDb().update(P).set({ autoAccept: true }).where(and(eq(P.id, connObj.id), eq(P.tenantId, t.id)));
  }
});

test("paket: masasız adisyon, müşteri defteri, serbest ücret satırı, kurye teslimi → kanal paket", async () => {
  const tabId = crypto.randomUUID();
  const a = crypto.randomUUID(), f = crypto.randomUUID();
  for (const d of [doc(tabId, { type: "open", guests: 0, kind: "paket" }), doc(tabId, orderEv()), doc(tabId, lineEv(a)), doc(tabId, feeEv(f))]) {
    assert.deepEqual(await applyDoc(kasa, d), { id: d.id, ok: true });
  }
  const fee = doc(tabId, feeEv(crypto.randomUUID()));
  await applyDoc(kasa, fee);
  assert.equal(await reviewOf(fee.id), null, "paket adisyonunda serbest satır review değil");

  // İkinci sipariş, yeni adres → aynı müşteri, iki adres
  const tab2 = crypto.randomUUID();
  await applyDoc(kasa, doc(tab2, { type: "open", guests: 0, kind: "paket" }));
  await applyDoc(kasa, doc(tab2, { ...orderEv("İnönü Sok. 3"), phone: "05321234567" }));
  await applyDoc(kasa, doc(tab2, lineEv(crypto.randomUUID())));
  const found = await lookupCustomer(t.id, s.store.id, "0532 123 45 67");
  assert.equal(found?.customer?.name, "Ayşe");
  assert.deepEqual(found?.addresses.map((x) => x.address).sort(), ["Atatürk Cad. 5", "İnönü Sok. 3"]);
  assert.equal(found?.addresses.find((x) => x.address === "Atatürk Cad. 5")?.zoneId, s.zone.id);
  assert.equal(found?.recent.length, 2);
  assert.equal(found?.recent[0].lines[0].name, "Lahmacun");
  assert.equal(await lookupCustomer(t.id, s.store.id, "12"), null);

  // Kurye: ata → yolda → teslim (kurye cihazında satış)
  await applyDoc(kasa, doc(tabId, { type: "courier", staffId: s.kurye.id }));
  await applyDoc(kuryeCtx, doc(tabId, { type: "out" }, { staffId: s.kurye.id }));
  const shift = crypto.randomUUID();
  await applyDoc(kuryeCtx, { kind: "shift_open", id: shift, staffId: s.kurye.id, at: now(), openingCash: 0 });
  const saleId = crypto.randomUUID();
  const sale = {
    kind: "sale", id: saleId, shiftId: shift, staffId: s.kurye.id, receiptSeq: 1, at: now(),
    lines: [{ productId: s.lah.id, name: "Lahmacun", unitPrice: 6000, vatRate: 10, qtyMilli: 2000, options: [], note: null, discount: 0 }, { productId: null, name: "Paket servis ücreti", unitPrice: 1500, vatRate: 10, qtyMilli: 1000, options: [], note: null, discount: 0 }],
    payments: [{ method: "nakit", amount: 13500 }],
    tab: { tabId, tableId: null, paidLines: [{ lineId: a, qtyMilli: 2000, discount: 0 }, { lineId: f, qtyMilli: 1000, discount: 0 }] },
  };
  assert.deepEqual(await applyDoc(kuryeCtx, sale), { id: saleId, ok: true });
  const del = doc(tabId, { type: "delivered", method: "nakit" }, { staffId: s.kurye.id });
  await applyDoc(kuryeCtx, del);
  assert.equal(await reviewOf(del.id), null);
  const [row] = await withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, saleId)));
  assert.deepEqual([row.channel, row.total, row.review, row.tableId], ["paket", 13500, null, null]);
  const lines = await withTenant(t.id, (tx) => tx.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId)));
  assert.equal(lines.find((l) => l.name === "Paket servis ücreti")?.productId, null);
});

test("serbest satır masa adisyonunda review; müdürsüz iptal review; atanmamış kurye teslimi review", async () => {
  const tabId = crypto.randomUUID();
  await applyDoc(kasa, doc(tabId, { type: "open", guests: 1 }, { tableId: s.m1.id }));
  const fee = doc(tabId, feeEv(crypto.randomUUID()), { tableId: s.m1.id });
  await applyDoc(kasa, fee);
  assert.match(String(await reviewOf(fee.id)), /serbest satır/);

  const p = crypto.randomUUID();
  await applyDoc(kasa, doc(p, { type: "open", guests: 0, kind: "paket" }));
  const del = doc(p, { type: "delivered", method: "nakit" }, { staffId: s.kurye.id });
  await applyDoc(kuryeCtx, del);
  assert.match(String(await reviewOf(del.id)), /atanmamış kurye/);
  const c = doc(p, { type: "cancel", reason: "vazgeçti" });
  await applyDoc(kasa, c);
  assert.match(String(await reviewOf(c.id)), /müdür onayı yok/);
});

test("webhook: imza, idempotens, otomatik kabul → accept + send + platform.accept audit; eşlenmeyen kod serbest satır", async () => {
  const body = JSON.stringify({ orders: [{ externalId: "M-1001", customer: { name: "Ali", phone: "0555 111 22 33" }, address: "Cumhuriyet Mah. 1", lines: [{ code: "LAH", name: "Lahmacun", unitPrice: 6500, qtyMilli: 1000 }, { code: "AYR", name: "Ayran", unitPrice: 1500, qtyMilli: 2000 }] }] });
  assert.deepEqual(mockSource.parseWebhook(body, new Headers({ "x-signature": sign("yanlış", body) }), connObj), { error: "İmza geçersiz.", status: 401 });
  const orders = mockSource.parseWebhook(body, new Headers({ "x-signature": sign(connObj.webhookSecret, body) }), connObj);
  assert.ok(Array.isArray(orders));
  assert.deepEqual(await ingestOrders(connObj, orders), { created: 1, duplicates: 0, unmapped: 1 });
  assert.deepEqual(await ingestOrders(connObj, orders), { created: 0, duplicates: 1, unmapped: 0 });

  const rows = await withTenant(t.id, (tx) => tx.select().from(schema.tabEvents).where(and(eq(schema.tabEvents.storeId, s.store.id), eq(schema.tabEvents.type, "order"))));
  const ord = rows.find((r) => (r.payload as { source?: { externalId: string } }).source?.externalId === "M-1001")!;
  assert.match(String(ord.review), /eşlenmeyen/);
  const tab = foldTabs(await withTenant(t.id, (tx) => tabEventsOf(tx, ord.tabId))).get(ord.tabId)!;
  assert.equal(tab.kind, "platform");
  assert.equal(deliveryStatus(tab), "hazirlaniyor");
  assert.deepEqual(tab.lines.map((l) => [l.productId, l.name, l.unitPrice]), [[s.lah.id, "Lahmacun", 6500], [null, "Ayran", 1500]]);
  assert.equal(tab.tickets.length, 1);
  const audits = (await withTenant(t.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.accept")))).filter(a => (a.detail as { externalId?: string }).externalId === "M-1001");
  assert.equal(audits.length, 1);
  assert.equal((audits[0].detail as { externalId: string }).externalId, "M-1001");
  const ali = await lookupCustomer(t.id, s.store.id, "05551112233");
  assert.equal(ali?.customer?.name, "Ali");
});

test("elle kabul: kasa accept olayı → platforma bir kez bildirilir; hata → review", async () => {
  const manual = { ...connObj, autoAccept: false };
  const mk = (id: string) => JSON.stringify({ orders: [{ externalId: id, customer: { name: "Veli", phone: "05551112244" }, address: "X", lines: [{ code: "LAH", name: "Lahmacun", unitPrice: 6500, qtyMilli: 1000 }] }] });
  for (const id of ["M-2001", "M-2002"]) await ingestOrders(manual, mockSource.parseWebhook(mk(id), new Headers({ "x-signature": sign(connObj.webhookSecret, mk(id)) }), manual) as never);
  const tabOf = async (ext: string) => (await withTenant(t.id, (tx) => tx.select().from(schema.tabEvents).where(eq(schema.tabEvents.type, "order")))).find((r) => (r.payload as { source?: { externalId: string } }).source?.externalId === ext)!.tabId;
  const t1 = await tabOf("M-2001");
  assert.equal(deliveryStatus(foldTabs(await withTenant(t.id, (tx) => tabEventsOf(tx, t1))).get(t1)!), "onay_bekliyor");
  const acc = doc(t1, { type: "accept", prepMin: 15 });
  await applyDoc(kasa, acc);
  await applyDoc(kasa, doc(t1, { type: "accept", prepMin: 15 }));
  const audits = (await withTenant(t.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.accept")))).filter((a) => (a.detail as { externalId: string }).externalId === "M-2001");
  assert.equal(audits.length, 1);

  const t2 = await tabOf("M-2002");
  process.env.MOCK_PLATFORM_FAIL = "1";
  const rej = doc(t2, { type: "reject", reason: "yoğunuz" });
  try { await applyDoc(kasa, rej); } finally { delete process.env.MOCK_PLATFORM_FAIL; }
  assert.match(String(await reviewOf(rej.id)), /platform bildirimi başarısız/);
});

test("durum bildirimi: out→picked, delivered→delivered; idempotent; hata→review", async () => {
  const mk = (id: string) => JSON.stringify({ orders: [{ externalId: id, customer: { name: "Zeynep", phone: "05551112255" }, address: "Y", lines: [{ code: "LAH", name: "Lahmacun", unitPrice: 6500, qtyMilli: 1000 }] }] });
  const statuses = async (ext: string) =>
    (await withTenant(t.id, (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.status")))).filter((a) => (a.detail as { externalId?: string }).externalId === ext);
  const tabOf = async (ext: string) =>
    (await withTenant(t.id, (tx) => tx.select().from(schema.tabEvents).where(eq(schema.tabEvents.type, "order")))).find((r) => (r.payload as { source?: { externalId?: string } }).source?.externalId === ext)!.tabId;

  await ingestOrders(connObj, mockSource.parseWebhook(mk("M-3001"), new Headers({ "x-signature": sign(connObj.webhookSecret, mk("M-3001")) }), connObj) as never);
  const t3 = await tabOf("M-3001");
  await applyDoc(kasa, doc(t3, { type: "courier", staffId: s.kurye.id }));
  const out = doc(t3, { type: "out" });
  await applyDoc(kasa, out);
  assert.equal(await reviewOf(out.id), null);
  let rows = await statuses("M-3001");
  assert.equal(rows.length, 1);
  assert.equal((rows[0].detail as { status?: string }).status, "picked");
  // Aynı durumun ikinci olayı (ikinci out) → bildirim tekrar yazılmaz
  const out2 = doc(t3, { type: "out" });
  await applyDoc(kasa, out2);
  assert.equal((await statuses("M-3001")).length, 1);
  // Teslim → ikinci durum
  const delivered = doc(t3, { type: "delivered", method: "online" }, { staffId: s.kurye.id });
  await applyDoc(kuryeCtx, delivered);
  assert.equal(await reviewOf(delivered.id), null);
  rows = await statuses("M-3001");
  assert.equal(rows.length, 2);
  assert.ok(rows.some((a) => (a.detail as { status?: string }).status === "delivered"));

  // Sahte platform hatası → olaya review + audit'e platform.error (bildirim geri almaz)
  await ingestOrders(connObj, mockSource.parseWebhook(mk("M-3002"), new Headers({ "x-signature": sign(connObj.webhookSecret, mk("M-3002")) }), connObj) as never);
  const t4 = await tabOf("M-3002");
  const out4 = doc(t4, { type: "out" });
  process.env.MOCK_PLATFORM_FAIL = "1";
  try { await applyDoc(kasa, out4); } finally { delete process.env.MOCK_PLATFORM_FAIL; }
  assert.match(String(await reviewOf(out4.id)), /platform durum bildirimi başarısız/);
  await applyDoc(kasa, out4);
  assert.equal(await reviewOf(out4.id), null);
  assert.equal((await statuses("M-3002")).length, 1);
});

test("eski kapsam bilgisi olmayan başarılı audit tek siparişte yeniden bildirim oluşturmaz", async () => {
  const order = incoming("LEGACY-1");
  await ingestOrders({ ...connObj, autoAccept: false }, [order]);
  const rows = await orderEvents(s.store.id, order.externalId);
  const acc = { id: crypto.randomUUID(), tabId: rows[0].tabId };
  await withTenant(t.id, async tx => {
    await tx.insert(schema.tabEvents).values({ ...acc, tenantId: t.id, storeId: s.store.id, at: new Date(Date.now() + 100), type: "accept", payload: { type: "accept", prepMin: 20 } });
    await tx.insert(schema.auditLog).values({ tenantId: t.id, actor: "system", action: "platform.accept", detail: { platform: "mock", externalId: order.externalId, prepMin: 20 } });
  });
  process.env.MOCK_PLATFORM_FAIL = "1";
  try { await ingestOrders(connObj, [order]); } finally { delete process.env.MOCK_PLATFORM_FAIL; }
  assert.equal(await reviewOf(acc.id), null);
});

test("incelemeye düşen yetkisiz teslim platforma iletilmez", async () => {
  const order = incoming("INVALID-DELIVERY-1");
  await ingestOrders(connObj, [order]);
  const rows = await orderEvents(s.store.id, order.externalId);
  const delivered = doc(rows[0].tabId, { type: "delivered", method: "online" });
  await applyDoc(kasa, delivered);
  assert.match(String(await reviewOf(delivered.id)), /atanmamış kurye/);
  const audits = await withTenant(t.id, tx => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "platform.status")));
  assert.equal(audits.filter(a => (a.detail as { tabId?: string }).tabId === delivered.tabId).length, 0);
});
