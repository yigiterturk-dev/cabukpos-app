// tests/platform-adapters.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_PLATFORMS, sourceFor } from "@/lib/platform";
import { createGetirSource, parseSandboxPayload as parseGetir } from "@/lib/platform/getir";
import { createYemeksepetiSource, parseSandboxPayload as parseYemeksepeti } from "@/lib/platform/yemeksepeti";
import { createTrendyolSource, parseSandboxPayload as parseTrendyol } from "@/lib/platform/trendyol";
import { createMigrosSource, parseSandboxPayload as parseMigros } from "@/lib/platform/migros";
import { sign, signAt, verifySignature } from "@/lib/platform/mock";
import type { Conn } from "@/lib/platform/types";

const conn: Conn = { id: "00000000-0000-0000-0000-000000000000", tenantId: "t", storeId: "s", platform: "getir", credentials: null, webhookSecret: "sifre", webhookToken: "webhook-token-0123456789abcd", autoAccept: false, active: true };

test("webhook imzası: timestamp'li biçim replay'a kapanık; header yoksa eski biçim geçerli", () => {
  const raw = '{"x":1}';
  const now = 1_700_000_000_000;
  const ts = Math.floor(now / 1000);
  // Yeni biçim: taze timestamp → geçerli; 6 dk eski → red; bozuk timestamp → red; timestamp'li imza timestamp'sız çağrıda red
  assert.equal(verifySignature("sifre", raw, signAt("sifre", raw, ts), String(ts), now), true);
  assert.equal(verifySignature("sifre", raw, signAt("sifre", raw, ts - 361), String(ts - 361), now), false);
  assert.equal(verifySignature("sifre", raw, signAt("sifre", raw, ts), "abc", now), false);
  assert.equal(verifySignature("sifre", raw, signAt("sifre", raw, ts)), false);
  // Eski biçim: timestamp header'ı yoksa gövde imzası geçerli; yeni imza eski doğrulamayla uyuşmaz
  assert.equal(verifySignature("sifre", raw, sign("sifre", raw)), true);
  assert.equal(verifySignature("sifre", raw, sign("sifre", raw), String(ts), now), false);
});

test("kayıt: dört platform + mock kayıtlı", () => {
  for (const p of ["mock", "getir", "yemeksepeti", "trendyol", "migros"]) assert.equal(sourceFor(p)?.id, p, p);
  assert.ok(SUPPORTED_PLATFORMS.includes("mock"));
});

test("kapalı sürücü ağa çıkmaz", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error("ağ çağrısı olmamalıydı"); }) as typeof fetch;
  try {
    const g = createGetirSource(false), ys = createYemeksepetiSource(false), tr = createTrendyolSource(false), mg = createMigrosSource(false);
    await assert.rejects(g.accept(conn, "o1", 5), /kapalı/);
    await assert.rejects(g.reject(conn, "o1", "neden"), /kapalı/);
    await assert.rejects(ys.accept(conn, "o1", 5), /kapalı/);
    await assert.rejects(tr.accept(conn, "o1", 5), /kapalı/);
    await assert.rejects(tr.pushStatus!(conn, "o1", "picked"), /kapalı/);
    await assert.rejects(mg.accept(conn, "o1", 5), /kapalı/);
    await assert.rejects(mg.pushStatus!(conn, "o1", "delivered"), /kapalı/);
    assert.equal(calls, 0);
    const h = new Headers();
    assert.deepEqual(g.parseWebhook("{}", h, conn), { error: "Getir bağlantısı kapalı.", status: 400 });
    assert.deepEqual(ys.parseWebhook("{}", h, conn), { error: "Yemeksepeti bağlantısı kapalı.", status: 400 });
    assert.deepEqual(tr.parseWebhook("{}", h, conn), { error: "Trendyol bağlantısı kapalı.", status: 400 });
    assert.deepEqual(mg.parseWebhook("{}", h, conn), { error: "Migros bağlantısı kapalı.", status: 400 });
  } finally {
    globalThis.fetch = original;
  }
});

test("hatalı sandbox gövdesi zod ile Türkçe hatayla reddedilir", () => {
  assert.throws(() => parseGetir({ bilinmeyen: true }), /Getir sandbox gövdesi tanınmadı/);
  assert.throws(() => parseGetir({ orders: [{ orderId: "o1" }] }), /tanınmadı/);
  assert.throws(() => parseYemeksepeti({ orders: [{ order_id: "o1", items: "yok" }] }), /Yemeksepeti sandbox gövdesi tanınmadı/);
  assert.throws(() => parseTrendyol({ orders: [{ id: "o1" }] }), /Trendyol sandbox gövdesi tanınmadı/);
  assert.throws(() => parseMigros({ orders: [{ orderRef: "o1" }] }), /Migros sandbox gövdesi tanınmadı/);
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
  const tr = parseTrendyol({ orders: [{ id: "T1", customer: { fullName: "Zeynep Kaya", phone: "05554443322" }, deliveryAddress: "Bulvar 3", paymentType: "CREDIT_CARD", note: null, products: [{ code: "D1", name: "Döner", price: 20000, quantity: 1, note: null }] }] });
  assert.equal(tr[0].payIntent, "kart");
  assert.equal(tr[0].lines[0].qtyMilli, 1000);
  const mg = parseMigros({ orders: [{ orderRef: "M1", client: { title: "Ali Veli", gsm: "05559998877" }, addressLine: "Yol 4", payment: "yemek_karti", remark: "kapı zili", items: [{ sku: "S1", title: "Su", unitPrice: 1000, qtyMilli: 6000, note: null }] }] });
  assert.equal(mg[0].payIntent, "yemek_karti");
  assert.deepEqual(mg[0].lines[0], { code: "S1", name: "Su", unitPrice: 1000, qtyMilli: 6000, note: null });
});
