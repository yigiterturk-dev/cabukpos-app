import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyGrowthWebhookSignature } from "@/lib/growth/webhook";

const secret = "cpk_test_secret";
const body = JSON.stringify({ campaignId: "00000000-0000-0000-0000-000000000000", type: "delivered", externalId: "evt-1" });
const timestamp = "1790841600";
const sign = (value: string) => createHmac("sha256", secret).update(value + "." + body).digest("hex");

test("growth webhook imzası timestamp + ham gövdeyi doğrular", () => {
  const nowMs = Number(timestamp) * 1000;
  assert.equal(verifyGrowthWebhookSignature({ rawBody: body, timestamp, signature: sign(timestamp), secret, nowMs }), true);
  assert.equal(verifyGrowthWebhookSignature({ rawBody: body, timestamp, signature: sign(timestamp).slice(0, -1) + "0", secret, nowMs }), false);
  assert.equal(verifyGrowthWebhookSignature({ rawBody: body + " ", timestamp, signature: sign(timestamp), secret, nowMs }), false);
});

test("growth webhook eski veya bozuk timestamp'i reddeder", () => {
  const nowMs = Number(timestamp) * 1000;
  const stale = String(Number(timestamp) - 301);
  assert.equal(verifyGrowthWebhookSignature({ rawBody: body, timestamp: stale, signature: sign(stale), secret, nowMs }), false);
  assert.equal(verifyGrowthWebhookSignature({ rawBody: body, timestamp: "bozuk", signature: sign(timestamp), secret, nowMs }), false);
  assert.equal(verifyGrowthWebhookSignature({ rawBody: body, timestamp, signature: null, secret, nowMs }), false);
});
