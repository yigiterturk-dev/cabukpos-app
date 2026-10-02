// tests/kiosk.test.ts — #37: kiosko olay kurulumu + müşteri durumu (saf) + sipariş yazımı (cabukpos_test).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema, withTenant } = await import("@/db");
const { kioskConn, kioskEvents, kioskOrder, kioskStatus } = await import("@/lib/kiosk");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "KIOSK-T", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

const menu = new Map([
  ["doner", { id: "doner", name: "Döner", vatRate: 10 as const, stationId: null, price: 18000 }],
  ["ayran", { id: "ayran", name: "Ayran", vatRate: 10 as const, stationId: null, price: 2500 }],
]);
let n = 0;
const newId = () => `id-${++n}`;

test("kiosko olayları: open+order+add'ler; autoAccept bilet ekler; boş sepet boş", () => {
  const r = kioskEvents(
    [{ productId: "doner", qtyMilli: 2000, note: "az acılı" }, { productId: "ayran", qtyMilli: 1000, note: null }],
    menu, { name: "Veli", phone: "", note: null, payIntent: "nakit" }, true, newId, 20,
  );
  assert.deepEqual(r.events.map((e) => e.type), ["open", "order", "add", "add", "accept", "send"]);
  assert.equal(r.total, 18000 * 2 + 2500); // Math.round(unit*qty/1000)
  const ord = r.events[1] as Extract<(typeof r.events)[number], { type: "order" }>;
  assert.equal(ord.source?.platform, "kiosk");
  assert.ok(ord.source?.externalId.startsWith("k-"));
  const empty = kioskEvents([{ productId: "yok", qtyMilli: 1000, note: null }], menu, { name: "x", phone: "", note: null, payIntent: "nakit" }, false, newId, 20);
  assert.deepEqual(empty, { events: [], total: 0 });
});

test("müşteri durumu: alındı → onay → hazırlanıyor → tamam; red", () => {
  const at = (m: number) => new Date(2026, 9, 2, 12, m).toISOString();
  const base = [
    { type: "open", at: at(0), payload: { type: "open" } as never },
    { type: "order", at: at(0), payload: { type: "order" } as never },
    { type: "add", at: at(1), payload: { type: "add" } as never },
  ];
  assert.equal(kioskStatus(base).step, "alindi");
  const acc = [...base, { type: "accept", at: at(2), payload: { type: "accept", prepMin: 15 } as never }];
  const st = kioskStatus(acc);
  assert.equal(st.step, "onaylandi");
  assert.equal(st.prepMin, 15);
  assert.ok(st.etaAt && st.etaAt.getMinutes() === 17);
  assert.equal(kioskStatus([...acc, { type: "send", at: at(3), payload: { type: "send" } as never }]).step, "hazirlaniyor");
  assert.equal(kioskStatus([...acc, { type: "paid", at: at(9), payload: { type: "paid" } as never }]).closed, true);
  assert.equal(kioskStatus([...base, { type: "reject", at: at(2), payload: { type: "reject", reason: "kapalı" } as never }]).step, "iptal");
});

test("kiosko siparişi: sır doğrulaması + tab olayları düşer", async () => {
  const storeId = (await withTenant(t.id, async (tx) => (await tx.insert(schema.stores).values({ tenantId: t.id, name: "ŞUBE" }).returning({ id: schema.stores.id }))[0].id));
  await withTenant(t.id, (tx) => tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }));
  const secret = "kiosk-sirri-1234567890";
  await getDb().insert(schema.platformConnections).values({ tenantId: t.id, storeId, platform: "kiosk", webhookSecret: secret });
  const conn = await kioskConn(storeId, secret);
  assert.ok(conn, "sırrı doğru bağlantı bulunmalı");
  assert.equal(await kioskConn(storeId, "yanlış-sirri-00000000000"), null);
  const prodId = (await withTenant(t.id, (tx) => tx.select({ id: schema.products.id }).from(schema.products)))[0]!.id;
  const r = await kioskOrder(conn!, { name: "Veli", phone: "05551112233", note: null, payIntent: "nakit", lines: [{ productId: prodId, qtyMilli: 1000, note: null }] });
  assert.ok(r.ok, "sipariş düşmeli");
  const tabId = (r as { ok: true; tabId: string }).tabId;
  const evs = await withTenant(t.id, (tx) => tx.select().from(schema.tabEvents).where(eq(schema.tabEvents.tabId, tabId)));
  assert.deepEqual(evs.map((e) => e.type), ["open", "order", "add"]);
  assert.equal((evs.find((e) => e.type === "add")?.payload as { stationId: string | null }).stationId, null);
  const cust = await withTenant(t.id, (tx) => tx.select().from(schema.customers));
  assert.equal(cust.length, 1); // telefonu olan kiosko müşterisi deftere düşer
});
