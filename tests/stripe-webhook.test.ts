// Stripe webhook imza doğrulaması — para yolunun kilidi.
// Çalıştır: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createStripeProvider } from "../lib/payments/stripe.ts";

const SECRET = "whsec_test_secret";
const provider = createStripeProvider("sk_test_x", SECRET);

function sign(body: string, ts = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

const paidBody = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      amount_total: 350000,
      currency: "try",
      metadata: { businessId: "b-1", planId: "profesyonel" },
    },
  },
});

test("geçerli imza → ödeme olayı çözülür", async () => {
  const evt = await provider.parseWebhook(paidBody, sign(paidBody));
  assert.equal(evt.type, "subscription_paid");
  if (evt.type !== "subscription_paid") return;
  assert.equal(evt.businessId, "b-1");
  assert.equal(evt.planId, "profesyonel");
  assert.equal(evt.amount, 3500); // kuruş → TL
});

test("imza yoksa reddedilir", async () => {
  await assert.rejects(() => provider.parseWebhook(paidBody, null));
});

test("gövde değiştirilmişse reddedilir (imza eski gövdeye ait)", async () => {
  const sig = sign(paidBody);
  const tampered = paidBody.replace('"profesyonel"', '"isletme"');
  await assert.rejects(() => provider.parseWebhook(tampered, sig));
});

test("yanlış secret ile üretilmiş imza reddedilir", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const bad = createHmac("sha256", "whsec_wrong").update(`${ts}.${paidBody}`).digest("hex");
  await assert.rejects(() => provider.parseWebhook(paidBody, `t=${ts},v1=${bad}`));
});

test("eski zaman damgası reddedilir (replay)", async () => {
  const old = Math.floor(Date.now() / 1000) - 3600;
  await assert.rejects(() => provider.parseWebhook(paidBody, sign(paidBody, old)));
});

test("metadata'sı olmayan olay yok sayılır, ödeme sayılmaz", async () => {
  const body = JSON.stringify({
    id: "evt_2",
    type: "checkout.session.completed",
    data: { object: { amount_total: 999900, currency: "try" } },
  });
  const evt = await provider.parseWebhook(body, sign(body));
  assert.equal(evt.type, "ignored");
});

test("bilinmeyen plan kimliği ödeme sayılmaz", async () => {
  const body = JSON.stringify({
    id: "evt_3",
    type: "checkout.session.completed",
    data: {
      object: {
        amount_total: 100,
        currency: "try",
        metadata: { businessId: "b-1", planId: "bedava-hepsi" },
      },
    },
  });
  const evt = await provider.parseWebhook(body, sign(body));
  assert.equal(evt.type, "ignored");
});

test("abonelik iptali olayı çözülür", async () => {
  const body = JSON.stringify({
    id: "evt_4",
    type: "customer.subscription.deleted",
    data: { object: { metadata: { businessId: "b-9" } } },
  });
  const evt = await provider.parseWebhook(body, sign(body));
  assert.equal(evt.type, "subscription_cancelled");
});

test("bozuk JSON gövdesi reddedilir (imza doğru olsa bile)", async () => {
  const bad = "{ bu json degil";
  await assert.rejects(() => provider.parseWebhook(bad, sign(bad)), /JSON/);
});

test("id/type olmayan gövde reddedilir", async () => {
  const body = JSON.stringify({ data: { object: {} } });
  await assert.rejects(() => provider.parseWebhook(body, sign(body)), /id\/type/);
});
