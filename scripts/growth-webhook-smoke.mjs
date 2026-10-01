import { createHmac } from "node:crypto";

const base = process.env.GROWTH_SMOKE_BASE?.trim();
const key = process.env.GROWTH_SMOKE_KEY?.trim();
const campaignId = process.env.GROWTH_SMOKE_CAMPAIGN_ID?.trim();
const allow = process.env.ALLOW_GROWTH_SMOKE === "1";
const optOutSmoke = process.env.GROWTH_SMOKE_OPT_OUT === "1";

if (!allow) throw new Error("Bu smoke testi veri yazar; staging için ALLOW_GROWTH_SMOKE=1 gerekli.");
if (!base || !key || !campaignId) throw new Error("GROWTH_SMOKE_BASE, GROWTH_SMOKE_KEY ve GROWTH_SMOKE_CAMPAIGN_ID gerekli.");

const target = new URL("/api/growth/webhooks/events", base);
if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Smoke hedefi HTTPS veya localhost olmalı.");
if (target.hostname === "cabukpos-app.vercel.app") throw new Error("Smoke testi production alias'ında çalıştırılamaz.");
if (!/^[-0-9a-f]{36}$/i.test(campaignId)) throw new Error("GROWTH_SMOKE_CAMPAIGN_ID UUID olmalı.");

const recipientRef = "hmac-sha256:" + createHmac("sha256", key).update("smoke-recipient").digest("hex");
const body = JSON.stringify({ campaignId, type: "delivered", externalId: "smoke-" + Date.now(), recipientRef });
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
console.log("Growth webhook smoke başarılı: delivered ilk olay 201, duplicate 200.");

if (optOutSmoke) {
  if (process.env.ALLOW_GROWTH_OPT_OUT_SMOKE !== "1") throw new Error("Opt-out smoke için ALLOW_GROWTH_OPT_OUT_SMOKE=1 ayrıca gerekli.");
  const audienceTarget = new URL(`/api/growth/campaigns/${campaignId}/audience?limit=1`, base);
  const audienceResponse = await fetch(audienceTarget, {
    headers: { authorization: "Bearer " + key },
    signal: AbortSignal.timeout(10_000),
  });
  if (audienceResponse.status !== 200) throw new Error("Audience okunamadı: HTTP " + audienceResponse.status + " (kampanya sahibi onayı ve staging verisi gerekli)");
  const audience = await audienceResponse.json();
  const recipient = audience?.recipients?.[0]?.recipientRef;
  if (!/^hmac-sha256:[a-f0-9]{64}$/.test(recipient ?? "")) throw new Error("Audience PII'siz recipientRef döndürmedi veya hedef kitle boş.");
  if (JSON.stringify(audience).match(/phone|email|name|customerId/i)) throw new Error("Audience yanıtında PII/kimlik alanı bulundu.");
  const optOutBody = JSON.stringify({ campaignId, type: "opt_out", externalId: "smoke-optout-" + Date.now(), recipientRef: recipient });
  const optOutTimestamp = String(Math.floor(Date.now() / 1000));
  const optOutSignature = createHmac("sha256", key).update(optOutTimestamp + "." + optOutBody).digest("hex");
  const optOut = await fetch(target, {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
      "x-cabukpos-timestamp": optOutTimestamp,
      "x-cabukpos-signature": optOutSignature,
    },
    body: optOutBody,
    signal: AbortSignal.timeout(10_000),
  });
  if (optOut.status !== 201) throw new Error("RecipientRef opt-out uygulanmadı: HTTP " + optOut.status);
  console.log("RecipientRef opt-out smoke başarılı: audience PII'siz, opt-out 201.");
}
