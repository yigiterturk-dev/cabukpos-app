#!/usr/bin/env node
// Yemeksepeti Partner webhook smoke testi.
// Kullanım:
//   BASE_URL=https://cabukpos.com YS_WEBHOOK_TOKEN=... YS_WEBHOOK_SECRET=... node scripts/ys-partner-smoke.mjs
//   ... node scripts/ys-partner-smoke.mjs --cancel
//   ... node scripts/ys-partner-smoke.mjs --catalog-job
// Yönetim → Pazaryerleri → Yemeksepeti kartındaki webhook adresi ve jetonu kullanın.
import { randomUUID } from "node:crypto";

const args = new Set(process.argv.slice(2));
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const token = process.env.YS_WEBHOOK_TOKEN ?? "";
const secret = process.env.YS_WEBHOOK_SECRET ?? "";
const storeId = process.env.YS_STORE_ID ?? "store-1";
const chainId = process.env.YS_CHAIN_ID ?? "chain-1";
const orderId = process.env.YS_ORDER_ID ?? randomUUID();

if (!token || !secret) {
  console.error("YS_WEBHOOK_TOKEN ve YS_WEBHOOK_SECRET gerekli.");
  process.exit(2);
}

const address = {
  formattedAddress: "Test Mah. Deneme Sok. No 1, Kadıköy",
  street: "Deneme Sok.",
  number: "1",
  suburb: "Kadıköy",
  city: "İstanbul",
  instructions: "Kapıyı çal",
};
const order = {
  order_id: orderId,
  external_order_id: `SMOKE-${Date.now()}`,
  order_code: "smoke-0001",
  status: "RECEIVED",
  transport_type: "VENDOR_DELIVERY",
  order_type: "DELIVERY",
  comment: "Smoke test siparişi",
  promised_for: new Date(Date.now() + 30 * 60_000).toISOString(),
  client: { chain_id: chainId, store_id: storeId },
  customer: { first_name: "Test", last_name: "Müşteri", phone_number: "05550000000", delivery_address: address },
  items: [{ sku: "TEST", name: "Test Ürün", pricing: { quantity: 1, unit_price: 100, total_price: 100 } }],
  payment: { type: "PAID", order_total: 100, collect_at_pickup: 0 },
};

const payload = args.has("--catalog-job")
  ? { job_id: `job-${Date.now()}`, job_status: "COMPLETED", platform_vendor_id: storeId, download_url: "https://example.com/feedback.csv" }
  : args.has("--cancel")
  ? { ...order, status: "CANCELLED", cancellation: { reason: "Smoke test iptali", post_picked_up: false } }
  : order;

const url = `${base}/api/platform/yemeksepeti/webhook?t=${encodeURIComponent(token)}`;
const response = await fetch(url, {
  method: "POST",
  headers: { authorization: secret, "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const text = await response.text();
console.log(`${response.status} ${response.statusText}`);
console.log(text);
if (!response.ok) process.exit(1);
