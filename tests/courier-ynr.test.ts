// tests/courier-ynr.test.ts — Dış kurye (YNR) istemcisi, gövde eşlemesi ve yapılandırma.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryIsReady, ynrOrderFromTab } from "@/lib/courier/payload";
import { createYnrClient, ynrConfig, ynrTarget, type YnrConfig } from "@/lib/courier/ynr";
import type { TabState } from "@/lib/core/tab";

const cfg: YnrConfig = {
  base: "https://ynr.test",
  token: "gizli-anahtar",
  provider: "cabukpos",
  accounts: {},
  pickups: {},
  dryRun: false,
};

const input = { provider: "cabukpos", accountId: "magaza-1", pickup: { address: "Dükkan", lat: 41.28, lng: 36.33 }, dropoff: { lat: 41.29, lng: 36.34 } };

function tab(over: Partial<TabState> = {}, delivery: Partial<TabState["delivery"]> = {}): TabState {
  return {
    id: "tab-1", tableId: null, kind: "paket",
    order: { customerId: null, name: "Örnek Müşteri", phone: "0532 123 45 67", address: "Teslim adresi", directions: null, zoneId: null, note: "kapıcıya bırak", payIntent: "nakit", promisedAt: null, source: null },
    delivery: { courierId: null, acceptedAt: null, prepMin: null, rejected: null, cancelled: null, outAt: null, deliveredAt: null, method: null, handedOver: false, ...delivery },
    openedAt: "2026-10-30T10:00:00.000Z", lastAt: "2026-10-30T10:00:00.000Z", guests: 0, staffId: null,
    lines: [], tickets: [], discount: null, billRequested: false, closeRequested: false, mergedAway: false,
    gross: 28550, discountAmount: 0, total: 28550, paid: 0, remaining: 28550, closed: false, closedAt: null,
    ...over,
  } as TabState;
}

test("gövde: telefon kanonikleşir, kapıda ödeme kuruştan TL'ye çevrilir", () => {
  const r = ynrOrderFromTab(tab(), input, true);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.order.order.customerPhone, "+905321234567");
  assert.equal(r.order.order.codAmount, 285.5);
  assert.equal(r.order.externalOrderId, "tab-1");
  assert.equal(r.order.order.dropoffLat, 41.29);
  assert.equal(r.order.order.notes, "kapıcıya bırak");
});

test("gövde: online ödenmiş siparişte kapıda tahsilat yok", () => {
  const r = ynrOrderFromTab(tab({ order: { ...tab().order!, payIntent: "online" } }), input, false);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.order.order.codAmount, 0);
});

test("gövde: masa, platform ve kapalı sipariş reddedilir", () => {
  assert.equal(ynrOrderFromTab(tab({ kind: "masa" }), input, true).ok, false);
  assert.equal(ynrOrderFromTab(tab({ kind: "platform" }), input, true).ok, false);
  assert.equal(ynrOrderFromTab(tab({}, { cancelled: "müşteri iptal" }), input, true).ok, false);
  assert.equal(ynrOrderFromTab(tab({}, { deliveredAt: "2026-10-30T10:30:00.000Z" }), input, true).ok, false);
  assert.equal(ynrOrderFromTab(tab({ order: { ...tab().order!, address: "  " } }), input, true).ok, false);
  assert.equal(ynrOrderFromTab(tab({ order: { ...tab().order!, phone: "123" } }), input, true).ok, false);
});

test("hazırlık: biletlerin hepsi hazır/teslim değilse hazır sayılmaz", () => {
  assert.equal(deliveryIsReady(tab()), false);
  const ready = tab();
  ready.tickets = [{ id: "k1", stationId: null, lineIds: [], at: "2026-10-30T10:00:00.000Z", staffId: null, status: "hazir", readyAt: "2026-10-30T10:10:00.000Z", printed: true }];
  assert.equal(deliveryIsReady(ready), true);
});

test("yapılandırma: base/token yoksa kapalı, JSON haritaları çözülür", () => {
  assert.equal(ynrConfig({} as unknown as NodeJS.ProcessEnv), null);
  assert.equal(ynrConfig({ YNR_API_BASE: "https://x", YNR_TOKEN: "t" } as unknown as NodeJS.ProcessEnv)?.provider, "cabukpos");
  const c = ynrConfig({
    YNR_API_BASE: "https://x/", YNR_TOKEN: "t", YNR_DRY_RUN: "1",
    YNR_ACCOUNTS_JSON: '{"store-1":"magaza-1"}',
    YNR_PICKUPS_JSON: '{"store-1":{"address":"Dükkan","lat":41.28,"lng":36.33}}',
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(c?.base, "https://x");
  assert.equal(c?.dryRun, true);
  assert.deepEqual(ynrTarget(c!, "store-1")?.accountId, "magaza-1");
  assert.equal(ynrTarget(c!, "store-2"), null);
});

test("istemci: başarılı gönderim, 422 hatası ve zaman aşımı ayrışır", async () => {
  const okFetch = (async () => new Response(JSON.stringify({ ok: true, duplicate: false, code: "YN-1" }), { status: 201 })) as unknown as typeof fetch;
  const ok = await createYnrClient(cfg, { fetch: okFetch }).sendOrder({ provider: "cabukpos", accountId: "m", externalOrderId: "t", dispatchReady: true, order: { customerName: "a", customerPhone: "+905321234567", pickupAddress: "p", pickupLat: 1, pickupLng: 2, dropoffAddress: "d", dropoffLat: 3, dropoffLng: 4, price: 0, codAmount: 0 } });
  assert.equal(ok.ok, true);
  assert.equal((ok as { status: number }).status, 201);

  const bad = (async () => new Response(JSON.stringify({ error: "Yol doğrulanamadı" }), { status: 422 })) as unknown as typeof fetch;
  const fail = await createYnrClient(cfg, { fetch: bad }).cancelOrder({ provider: "cabukpos", accountId: "m", externalOrderId: "t" });
  assert.equal(fail.ok, false);
  assert.equal((fail as { status: number }).status, 422);
  assert.match((fail as { error: string }).error, /Yol doğrulanamadı/);

  const timeout = (async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
  const t = await createYnrClient(cfg, { fetch: timeout }).getStatus({ provider: "cabukpos", accountId: "m", externalOrderId: "t" });
  assert.equal(t.ok, false);
  assert.match((t as { error: string }).error, /zaman aşımı/);
});

test("istemci: DRY_RUN ağa çıkmaz", async () => {
  let called = 0;
  const spy = (async () => { called++; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  const r = await createYnrClient({ ...cfg, dryRun: true }, { fetch: spy }).sendOrder({ provider: "cabukpos", accountId: "m", externalOrderId: "t", dispatchReady: true, order: { customerName: "a", customerPhone: "+905321234567", pickupAddress: "p", pickupLat: 1, pickupLng: 2, dropoffAddress: "d", dropoffLat: 3, dropoffLng: 4, price: 0, codAmount: 0 } });
  assert.equal(r.ok, true);
  assert.equal(called, 0);
});
