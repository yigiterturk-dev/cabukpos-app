// tests/platform-adapters.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_PLATFORMS, sourceFor } from "@/lib/platform";
import { createGetirSource, parseSandboxPayload as parseGetir } from "@/lib/platform/getir";
import { createYemeksepetiSource, parseSandboxPayload as parseYemeksepeti } from "@/lib/platform/yemeksepeti";
import type { Conn } from "@/lib/platform/types";

const conn: Conn = { id: "00000000-0000-0000-0000-000000000000", tenantId: "t", storeId: "s", platform: "getir", credentials: null, webhookSecret: "sifre", autoAccept: false };

test("kayıt: getir/yemeksepeti var, mock varsayılan", () => {
  assert.ok(SUPPORTED_PLATFORMS.includes("mock"));
  assert.equal(sourceFor("getir")?.id, "getir");
  assert.equal(sourceFor("yemeksepeti")?.id, "yemeksepeti");
  assert.equal(sourceFor("mock")?.id, "mock");
  assert.equal(sourceFor("trendyol"), null);
});

test("kapalı sürücü ağa çıkmaz", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error("ağ çağrısı olmamalıydı"); }) as typeof fetch;
  try {
    const g = createGetirSource(false), ys = createYemeksepetiSource(false);
    await assert.rejects(g.accept(conn, "o1", 5), /kapalı/);
    await assert.rejects(g.reject(conn, "o1", "neden"), /kapalı/);
    await assert.rejects(ys.accept(conn, "o1", 5), /kapalı/);
    assert.equal(calls, 0);
    const h = new Headers();
    assert.deepEqual(g.parseWebhook("{}", h, conn), { error: "Getir bağlantısı kapalı.", status: 400 });
    assert.deepEqual(ys.parseWebhook("{}", h, conn), { error: "Yemeksepeti bağlantısı kapalı.", status: 400 });
  } finally {
    globalThis.fetch = original;
  }
});

test("hatalı sandbox gövdesi zod ile Türkçe hatayla reddedilir", () => {
  assert.throws(() => parseGetir({ bilinmeyen: true }), /Getir sandbox gövdesi tanınmadı/);
  assert.throws(() => parseGetir({ orders: [{ orderId: "o1" }] }), /tanınmadı/);
  assert.throws(() => parseYemeksepeti({ orders: [{ order_id: "o1", items: "yok" }] }), /Yemeksepeti sandbox gövdesi tanınmadı/);
});

test("geçerli gövde IncomingOrder'a çevrilir", () => {
  const g = parseGetir({ orders: [{ orderId: "G1", customer: { firstName: "Ayşe", lastName: "Yılmaz", phone: "+905551112233" }, deliveryAddress: "Cad. 1", paymentMethod: "CASH", note: null, products: [{ sku: "K1", name: "Kahve", price: 5000, quantity: 2, note: null }] }] });
  assert.equal(g[0].externalId, "G1");
  assert.equal(g[0].customer.name, "Ayşe Yılmaz");
  assert.equal(g[0].payIntent, "nakit");
  assert.deepEqual(g[0].lines[0], { code: "K1", name: "Kahve", unitPrice: 5000, qtyMilli: 2000, note: null });
  const ys = parseYemeksepeti({ orders: [{ order_id: "Y1", client: { name: "Mehmet", phone: "05551112233" }, address_text: "Sok. 2", payment_type: "ticket", comment: "az şekerli", items: [{ code: "P1", name: "Pide", unit_price: 12000, qty: 1, note: null }] }] });
  assert.equal(ys[0].payIntent, "yemek_karti");
  assert.equal(ys[0].note, "az şekerli");
});
