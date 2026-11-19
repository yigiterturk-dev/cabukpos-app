// tests/yemeksepeti-partner.test.ts — Yemeksepeti Partner API v2 adaptörü.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { encodeConnectionCredentials } from "@/lib/platform/credentials";
import { createYemeksepetiSource } from "@/lib/platform/yemeksepeti";
import { parsePartnerEvent, parsePartnerPayload } from "@/lib/platform/yemeksepeti-partner";
import type { Conn } from "@/lib/platform/types";

process.env.AUTH_SECRET = "test-secret";

const payload = {
  order_id: "9d4a63b5-3e07-4440-96af-aa04797da3a0",
  external_order_id: "YS-78107",
  order_code: "wxfr-2440-rtbs",
  status: "RECEIVED",
  transport_type: "VENDOR_DELIVERY",
  order_type: "DELIVERY",
  comment: "Az pişmiş",
  promised_for: "2026-11-14T18:00:00Z",
  client: { chain_id: "chain-1", store_id: "store-1" },
  customer: {
    first_name: "Ali",
    last_name: "Veli",
    phone_number: "05551112233",
    delivery_address: { formattedAddress: "Mahalle Sok. No 1, Kadıköy", instructions: "Kapıyı çal" },
  },
  items: [{ sku: "P1", name: "Pide", pricing: { quantity: 2, unit_price: 120.5, total_price: 241 } }],
  payment: { type: "PAID", order_total: 241, collect_at_pickup: 0 },
};

const conn = (credentials: Conn["credentials"], webhookSecret = "hook-secret"): Conn => ({
  id: `ys-${Math.random().toString(36).slice(2)}`,
  tenantId: "t1",
  storeId: "s1",
  platform: "yemeksepeti",
  credentials,
  webhookSecret,
  webhookToken: "webhook-token-0123456789abcd",
  autoAccept: true,
  active: true,
});

test("Partner siparişi IncomingOrder'a çevrilir", () => {
  const [order] = parsePartnerPayload(payload);
  assert.equal(order.externalId, payload.order_id);
  assert.equal(order.externalCode, payload.order_code);
  assert.equal(order.customer.name, "Ali Veli");
  assert.equal(order.customer.phone, "05551112233");
  assert.equal(order.address, "Mahalle Sok. No 1, Kadıköy");
  assert.equal(order.directions, "Kapıyı çal");
  assert.equal(order.payIntent, "online");
  assert.equal(order.collectAmount, 0);
  assert.equal(order.deliveryOwner, "vendor");
  assert.equal(order.promisedAt, payload.promised_for);
  assert.deepEqual(order.lines[0], { code: "P1", name: "Pide", unitPrice: 12050, qtyMilli: 2000, note: null });
});

test("platform kuryeli, gel-al ve RECEIVED dışı olaylar içe alınmaz", () => {
  assert.deepEqual(parsePartnerPayload({ ...payload, transport_type: "LOGISTICS_DELIVERY" }), []);
  assert.deepEqual(parsePartnerPayload({ ...payload, order_type: "PICKUP" }), []);
  assert.deepEqual(parsePartnerPayload({ ...payload, status: "READY_FOR_PICKUP" }), []);
  assert.deepEqual(parsePartnerPayload(payload, { externalStoreId: "baska-store" }), []);
});

test("kapıda tahsilat nakit niyeti ve kuruş tutarı üretir", () => {
  const [order] = parsePartnerPayload({ ...payload, payment: { type: "UNPAID", collect_at_pickup: 241.75 } });
  assert.equal(order.payIntent, "nakit");
  assert.equal(order.collectAmount, 24175);
});

test("Partner modu: OAuth, update order ve katalog sözleşmesi", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/v2/oauth/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 });
    if (String(url).endsWith("/catalog")) return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const c = conn(encodeConnectionCredentials({ mode: "partner", base: "https://ys.test", clientId: "id", clientSecret: "secret", chainId: "chain-1", vendorId: "vendor-1", externalStoreId: "store-1" }));
    const source = createYemeksepetiSource(true);

    await source.accept(c, "order-1", 20);
    assert.equal(calls.length, 0);

    await source.pushStatus!(c, "order-1", "ready");
    assert.equal(calls[0].url, "https://ys.test/v2/oauth/token");
    assert.equal(calls[0].init.method, "POST");
    assert.match(String(calls[0].init.body), /grant_type=client_credentials/);
    assert.equal(calls[1].url, "https://ys.test/v2/chains/chain-1/orders/order-1");
    assert.equal(calls[1].init.method, "PUT");
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { order_id: "order-1", status: "READY_FOR_PICKUP", items: [] });
    assert.equal((calls[1].init.headers as Record<string, string>).authorization, "Bearer tok");

    await source.reject(c, "order-1", "stok yok");
    assert.equal(calls.length, 3);
    assert.deepEqual(JSON.parse(String(calls[2].init.body)), { order_id: "order-1", status: "CANCELLED", items: [], cancellation: { reason: "stok yok" } });

    await source.pushStatus!(c, "order-1", "picked");
    assert.equal(JSON.parse(String(calls[3].init.body)).status, "DISPATCHED");
    await source.pushStatus!(c, "order-1", "delivered");
    assert.equal(JSON.parse(String(calls[4].init.body)).status, "DISPATCHED");

    const result = await source.pushCatalog!(c, [{ code: "P1", name: "Pide", price: 1250, stock: 3, active: true }]);
    assert.deepEqual(result, { ok: 1, failed: 0 });
    assert.equal(calls[5].url, "https://ys.test/v2/chains/chain-1/vendors/vendor-1/catalog");
    assert.deepEqual(JSON.parse(String(calls[5].init.body)), { products: [{ sku: "P1", price: 12.5, active: true, quantity: 3 }] });
  } finally {
    globalThis.fetch = original;
  }
});

test("iptal olayı paket alınmış bilgisini korur", () => {
  assert.deepEqual(parsePartnerEvent({ ...payload, status: "CANCELLED", cancellation: { reason: "Müşteri iptal etti", post_picked_up: true } }), [
    { type: "cancel", externalId: payload.order_id, reason: "Müşteri iptal etti", postPickedUp: true },
  ]);
  assert.deepEqual(parsePartnerEvent({ ...payload, status: "RECEIVED" }), []);
  assert.deepEqual(parsePartnerEvent({ ...payload, status: "CANCELED" }).length, 1);
});

test("katalog job sonucu ayrı olay olarak okunur", () => {
  assert.deepEqual(parsePartnerEvent({ job_id: "job-1", job_status: "COMPLETED", platform_vendor_id: "v1", download_url: "https://example.com/feedback.csv" }), [
    { type: "catalog_job", jobId: "job-1", status: "COMPLETED", downloadUrl: "https://example.com/feedback.csv" },
  ]);
});

test("READY ürün durumları YEMEKSEPETI_SEND_ITEMS=1 ile gönderilir", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  process.env.YEMEKSEPETI_SEND_ITEMS = "1";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/v2/oauth/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const c = conn(encodeConnectionCredentials({ mode: "partner", base: "https://ys.test", clientId: "id", clientSecret: "secret", chainId: "chain-1", vendorId: "vendor-1" }));
    const source = createYemeksepetiSource(true);
    await source.pushStatus!(c, "order-1", "ready", { items: [{ sku: "P1", status: "PICKED" }] });
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { order_id: "order-1", status: "READY_FOR_PICKUP", items: [{ sku: "P1", status: "PICKED" }] });
  } finally {
    delete process.env.YEMEKSEPETI_SEND_ITEMS;
    globalThis.fetch = original;
  }
});

test("Partner webhook'u statik jetonla doğrulanır; yanlış jeton 401", () => {
  const c = conn(encodeConnectionCredentials({ mode: "partner", base: "https://ys.test", clientId: "id", clientSecret: "secret", chainId: "chain-1", vendorId: "vendor-1" }));
  const source = createYemeksepetiSource(true);
  const ok = source.parseWebhook(JSON.stringify(payload), new Headers({ authorization: "hook-secret" }), c);
  assert.ok(Array.isArray(ok) && ok[0].externalId === payload.order_id);
  const bearer = source.parseWebhook(JSON.stringify(payload), new Headers({ authorization: "Bearer hook-secret" }), c);
  assert.ok(Array.isArray(bearer));
  assert.deepEqual(source.parseWebhook(JSON.stringify(payload), new Headers({ authorization: "yanlis" }), c), { error: "Webhook jetonu geçersiz.", status: 401 });
});

after(() => { delete process.env.AUTH_SECRET; });
