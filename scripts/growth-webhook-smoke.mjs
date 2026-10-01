import { createHmac } from "node:crypto";

const base = process.env.GROWTH_SMOKE_BASE?.trim();
const key = process.env.GROWTH_SMOKE_KEY?.trim();
const campaignId = process.env.GROWTH_SMOKE_CAMPAIGN_ID?.trim();
const allow = process.env.ALLOW_GROWTH_SMOKE === "1";

if (!allow) throw new Error("Bu smoke testi veri yazar; staging için ALLOW_GROWTH_SMOKE=1 gerekli.");
if (!base || !key || !campaignId) throw new Error("GROWTH_SMOKE_BASE, GROWTH_SMOKE_KEY ve GROWTH_SMOKE_CAMPAIGN_ID gerekli.");

const target = new URL("/api/growth/webhooks/events", base);
if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Smoke hedefi HTTPS veya localhost olmalı.");
if (target.hostname === "cabukpos-app.vercel.app") throw new Error("Smoke testi production alias'ında çalıştırılamaz.");
if (!/^[-0-9a-f]{36}$/i.test(campaignId)) throw new Error("GROWTH_SMOKE_CAMPAIGN_ID UUID olmalı.");

const body = JSON.stringify({ campaignId, type: "delivered", externalId: "smoke-" + Date.now() });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", key).update(timestamp + "." + body).digest("hex");
const request = () => fetch(target, {
  method: "POST",
  headers: {
    authorization: "Bearer " + key,
    "content-type": "application/json",
    "x-cabukpos-timestamp": timestamp,
    "x-cabukpos-signature": signature,
  },
  body,
  signal: AbortSignal.timeout(10_000),
});

const first = await request();
if (first.status !== 201) throw new Error("İlk webhook kabul edilmedi: HTTP " + first.status);
const duplicate = await request();
if (duplicate.status !== 200) throw new Error("Duplicate webhook idempotent dönmedi: HTTP " + duplicate.status);
console.log("Growth webhook smoke başarılı: ilk olay 201, duplicate 200.");
