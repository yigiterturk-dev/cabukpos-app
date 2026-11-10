// tests/sms-providers.test.ts — Netgsm REST v2 + İletimerkezi v1 sürücüleri (fetch mock'lu) ve seçim.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNetgsmProvider } from "@/lib/growth/messaging/netgsm";
import { createIletimerkeziProvider } from "@/lib/growth/messaging/iletimerkezi";
import { messagingProvider } from "@/lib/growth/messaging";
import { netgsmConfig, iletimerkeziConfig, normalizeTrPhone, type MessagingTarget } from "@/lib/growth/messaging/types";

const targets: MessagingTarget[] = [
  { recipientRef: "ref:a", phone: "+905551110011" },
  { recipientRef: "ref:b", phone: "05551110022" },
];

test("normalizeTrPhone: 90..., 0..., 10 hane", () => {
  assert.equal(normalizeTrPhone("+90 555 111 00 11"), "905551110011");
  assert.equal(normalizeTrPhone("0555 111 00 22"), "905551110022");
  assert.equal(normalizeTrPhone("5551110033"), "905551110033");
  assert.equal(normalizeTrPhone("123"), "123");
});

test("Netgsm: kapalıyken ağa çıkmaz", async () => {
  let called = 0;
  const p = createNetgsmProvider(false, { base: "https://x", username: "u", password: "p", header: "H" }, async () => { called++; return new Response("{}"); });
  await assert.rejects(p.send({ body: "x", targets }), /Pazarlama gönderimi kapalı/);
  assert.equal(called, 0);
});

test("Netgsm: eksik ayar Türkçe hata verir", async () => {
  const old = { ...process.env };
  delete process.env.NETGSM_USERNAME; delete process.env.NETGSM_PASSWORD; delete process.env.NETGSM_HEADER;
  assert.throws(() => netgsmConfig(), /Netgsm yapılandırılmamış/);
  await assert.rejects(createNetgsmProvider(true, null).send({ body: "x", targets }), /Netgsm yapılandırılmamış/);
  Object.assign(process.env, old);
});

test("Netgsm: istek gövdesi, Basic auth ve başarı eşlemesi", async () => {
  let url = "", init: RequestInit | undefined;
  const p = createNetgsmProvider(true, { base: "https://api.netgsm.test/", username: "u", password: "p", header: "CABUKPOS" }, (async (u: string | URL | Request, i?: RequestInit) => {
    url = String(u); init = i;
    return new Response(JSON.stringify({ code: "00", jobid: 12345 }), { status: 200 });
  }) as typeof fetch);
  const results = await p.send({ body: "Kampanya!", targets });
  assert.equal(url, "https://api.netgsm.test/sms/rest/v2/send");
  const body = JSON.parse(String(init?.body));
  assert.equal(body.msgheader, "CABUKPOS");
  assert.deepEqual(body.messages, [{ msg: "Kampanya!", no: "905551110011" }, { msg: "Kampanya!", no: "905551110022" }]);
  assert.equal(body.encoding, "TR");
  assert.equal(body.iysfilter, "0");
  assert.equal(body.appname, "CabukPOS");
  assert.match(String((init?.headers as Record<string, string>).authorization), /^Basic /);
  assert.deepEqual(results.map((r) => [r.recipientRef, r.externalId]), [["ref:a", "12345"], ["ref:b", "12345"]]);
});

test("Netgsm: sağlayıcı kodu hata → tümü hata, HTTP/tanınmayan → throw", async () => {
  const err = createNetgsmProvider(true, { base: "https://x", username: "u", password: "p", header: "H" }, (async () =>
    new Response(JSON.stringify({ code: "30", description: "yetkisiz" }), { status: 200 })) as typeof fetch);
  const results = await err.send({ body: "x", targets });
  assert.equal(results[0]?.externalId, null);
  assert.match(results[0]?.error ?? "", /yetkisiz/);

  const http = createNetgsmProvider(true, { base: "https://x", username: "u", password: "p", header: "H" }, (async () =>
    new Response("patladi", { status: 502 })) as typeof fetch);
  await assert.rejects(http.send({ body: "x", targets }), /HTTP 502/);

  const weird = createNetgsmProvider(true, { base: "https://x", username: "u", password: "p", header: "H" }, (async () =>
    new Response(JSON.stringify({ wrong: 1 }), { status: 200 })) as typeof fetch);
  await assert.rejects(weird.send({ body: "x", targets }), /tanınmadı/);
});

test("İletimerkezi: eksik ayar ve istek gövdesi/başarı eşlemesi", async () => {
  const old = { ...process.env };
  delete process.env.ILETIMERKEZI_USERNAME; delete process.env.ILETIMERKEZI_PASSWORD; delete process.env.ILETIMERKEZI_SENDER;
  assert.throws(() => iletimerkeziConfig(), /İletimerkezi yapılandırılmamış/);
  Object.assign(process.env, old);

  let url = "", init: RequestInit | undefined;
  const p = createIletimerkeziProvider(true, { base: "https://api.iletimerkezi.test", username: "u", password: "p", sender: "CABUKPOS" }, (async (u: string | URL | Request, i?: RequestInit) => {
    url = String(u); init = i;
    return new Response(JSON.stringify({ response: { status: { code: 200 }, order: { id: "o-1" } } }), { status: 200 });
  }) as typeof fetch);
  const results = await p.send({ body: "Kampanya!", targets });
  assert.equal(url, "https://api.iletimerkezi.test/v1/send-sms/json");
  const body = JSON.parse(String(init?.body));
  assert.equal(body.request.authentication.username, "u");
  assert.equal(body.request.message.sender, "CABUKPOS");
  assert.equal(body.request.message.text, "Kampanya!");
  assert.deepEqual(body.request.receivers.receiver, [{ number: "905551110011" }, { number: "905551110022" }]);
  assert.deepEqual(results.map((r) => r.externalId), ["o-1", "o-1"]);
});

test("İletimerkezi: 200 dışı kod → tümü hata", async () => {
  const p = createIletimerkeziProvider(true, { base: "https://x", username: "u", password: "p", sender: "H" }, (async () =>
    new Response(JSON.stringify({ response: { status: { code: 401, message: "kimlik hatası" } } }), { status: 200 })) as typeof fetch);
  const results = await p.send({ body: "x", targets });
  assert.equal(results[0]?.externalId, null);
  assert.match(results[0]?.error ?? "", /kimlik hatası/);
});

test("messagingProvider: sağlayıcı seçimi ve bilinmeyen ad", async () => {
  const old = { enabled: process.env.MARKETING_SMS_ENABLED, provider: process.env.MARKETING_SMS_PROVIDER };
  process.env.MARKETING_SMS_ENABLED = "1";
  try {
    process.env.MARKETING_SMS_PROVIDER = "netgsm";
    assert.equal(messagingProvider()?.id, "netgsm");
    process.env.MARKETING_SMS_PROVIDER = "iletimerkezi";
    assert.equal(messagingProvider()?.id, "iletimerkezi");
    process.env.MARKETING_SMS_PROVIDER = "yok";
    const p = messagingProvider();
    assert.equal(p?.id, "yok");
    await assert.rejects(p!.send({ body: "x", targets }), /Bilinmeyen SMS sağlayıcısı/);
    delete process.env.MARKETING_SMS_ENABLED;
    assert.equal(messagingProvider(), null);
  } finally {
    if (old.enabled === undefined) delete process.env.MARKETING_SMS_ENABLED; else process.env.MARKETING_SMS_ENABLED = old.enabled;
    if (old.provider === undefined) delete process.env.MARKETING_SMS_PROVIDER; else process.env.MARKETING_SMS_PROVIDER = old.provider;
  }
});
