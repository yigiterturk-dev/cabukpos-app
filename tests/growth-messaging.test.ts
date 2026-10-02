// tests/growth-messaging.test.ts — #34: SMS sürücüsü (saf, fetch mock'lu) + config kapıları.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSandboxSmsProvider } from "@/lib/growth/messaging/sandbox";
import { smsConfig, type MessagingTarget } from "@/lib/growth/messaging/types";

const targets: MessagingTarget[] = [
  { recipientRef: "hmac-sha256:aa", phone: "+905551110011" },
  { recipientRef: "hmac-sha256:bb", phone: "+905551110022" },
];

test("kapalıyken ağa çıkmaz, Türkçe hata atar", async () => {
  let called = 0;
  const provider = createSandboxSmsProvider(false, { base: "https://sms.test", key: "k", from: "KAFE" }, async () => { called++; throw new Error("ağa çıkılmamalı"); });
  await assert.rejects(provider.send({ body: "selam", targets }), /Pazarlama gönderimi kapalı/);
  assert.equal(called, 0);
});

test("config eksikse Türkçe hata; env okunur", () => {
  const old = { ...process.env };
  delete process.env.MARKETING_SMS_API_BASE; delete process.env.MARKETING_SMS_API_KEY; delete process.env.MARKETING_SMS_FROM;
  assert.throws(() => smsConfig(), /yapılandırılmamış/);
  process.env.MARKETING_SMS_API_BASE = "https://sms.test"; process.env.MARKETING_SMS_API_KEY = "k"; process.env.MARKETING_SMS_FROM = "KAFE";
  assert.deepEqual(smsConfig(), { base: "https://sms.test", key: "k", from: "KAFE" });
  Object.assign(process.env, old);
});

test("gönderim: gövde + ref sırası korunur, hedef bazlı hata eşlenir", async () => {
  let body = "";
  const provider = createSandboxSmsProvider(true, { base: "https://sms.test", key: "k", from: "KAFE" }, async (_url, init) => {
    body = init?.body as string;
    return new Response(JSON.stringify({ messages: [{ ref: "hmac-sha256:aa", id: "m-1" }, { ref: "hmac-sha256:bb", error: "geçersiz numara" }] }), { status: 200 });
  });
  const results = await provider.send({ body: "Kampanya!", targets });
  const sent = JSON.parse(body);
  assert.equal(sent.from, "KAFE");
  assert.deepEqual(sent.messages, [{ to: "+905551110011", ref: "hmac-sha256:aa" }, { to: "+905551110022", ref: "hmac-sha256:bb" }]);
  assert.equal(results[0]?.recipientRef, "hmac-sha256:aa");
  assert.equal(results[0]?.externalId, "m-1");
  assert.equal(results[1]?.externalId, null);
  assert.match(results[1]?.error ?? "", /geçersiz numara/);
});

test("sağlayıcı HTTP hatası ve tanınmayan cevap Türkçe hatayla düşer", async () => {
  const bad = createSandboxSmsProvider(true, { base: "https://sms.test", key: "k", from: "KAFE" }, async () => new Response("patladi", { status: 502 }));
  await assert.rejects(bad.send({ body: "x", targets }), /HTTP 502/);
  const weird = createSandboxSmsProvider(true, { base: "https://sms.test", key: "k", from: "KAFE" }, async () => new Response(JSON.stringify({ wrong: 1 }), { status: 200 }));
  await assert.rejects(weird.send({ body: "x", targets }), /tanınmadı/);
  const missing = createSandboxSmsProvider(true, { base: "https://sms.test", key: "k", from: "KAFE" }, async () => new Response(JSON.stringify({ messages: [{ ref: "hmac-sha256:aa", id: "m-1" }] }), { status: 200 }));
  const partial = await missing.send({ body: "x", targets });
  assert.match(partial[1]?.error ?? "", /cevabında yok/);
});
