// tests/okc-cloud.test.ts — Yol A bulut ÖKC sürücüsü: istek sözleşmesi, hata sınıfları, BYOK anahtar kapısı.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { getOkc } from "@/lib/fiscal/okc";
import { cloudOkc, type CloudOkcConfig } from "@/lib/fiscal/okc-cloud";

const doc = {
  serial: "TRA123456", seq: 7, receiptNo: "K1-000007", total: 11000,
  vat: [{ rate: 10, gross: 11000, net: 10000, vat: 1000 }],
  payments: [{ method: "kart", amount: 11000 }], soldAt: new Date("2026-10-08T10:00:00Z"),
};

async function withServer(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, body: string) => void): Promise<{ server: Server; url: Promise<string>; calls: { path: string; auth: string; body: string; method: string }[] }> {
  const calls: { path: string; auth: string; body: string; method: string }[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls.push({ path: req.url ?? "", auth: req.headers.authorization ?? "", body: raw, method: req.method ?? "" });
      handler(req, res, raw);
    });
  });
  const url = new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
  return { server, url, calls };
}

test("bulut ÖKC: kesim istek gövdesi + Bearer anahtar; cevap künyesi", async () => {
  const s = await withServer((_, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ no: "TRA123456-0007-000007", zNo: 7 })); });
  try {
    const cfg: CloudOkcConfig = { key: "gizli-anahtar", url: await s.url };
    const p = cloudOkc("parasut", cfg);
    const r = await p.receipt(doc);
    assert.deepEqual(r, { ok: true, no: "TRA123456-0007-000007", zNo: 7 });
    const c = s.calls[0];
    assert.equal(c.method, "POST");
    assert.match(c.path, /\/e-okc\/receipts$/);
    assert.equal(c.auth, "Bearer gizli-anahtar");
    const body = JSON.parse(c.body);
    assert.equal(body.deviceSerial, "TRA123456");
    assert.equal(body.receiptNo, "K1-000007");
    assert.equal(body.total, 11000);
    assert.equal(body.vat[0].rate, 10);
    assert.equal(body.soldAt, "2026-10-08T10:00:00.000Z");
  } finally { s.server.close(); }
});

test("bulut ÖKC: 5xx yeniden denenebilir, 4xx kalıcı; bozuk cevap tanınmaz; iptal + Z raporu", async () => {
  const s = await withServer((req, res) => {
    if (req.url === "/e-okc/receipts") { res.statusCode = 503; res.end(JSON.stringify({ error: "bakım" })); }
    else if (req.url?.endsWith("/cancel")) { res.statusCode = 400; res.end(JSON.stringify({ error: "fiş bulunamadı" })); }
    else if (req.url === "/e-okc/z-report") { res.end(JSON.stringify({ no: "Z-2026-10-08", zNo: 208 })); }
    else { res.end("tamam"); }
  });
  try {
    const p = cloudOkc("uyumsoft", { key: "k", url: await s.url });
    const bad = await p.receipt(doc);
    assert.equal(bad.ok, false);
    assert.match(bad.ok ? "" : bad.error, /HTTP 503/);
    assert.equal(bad.ok ? false : bad.retryable, true);
    const c = await p.cancel("TRA123456-0007-000007", new Date());
    assert.match(c.ok ? "" : c.error, /HTTP 400/);
    const z = await p.zReport!();
    assert.deepEqual(z, { ok: true, no: "Z-2026-10-08", zNo: 208 });
    // Bozuk cevap gövdesi
    s.server.close();
    const s2 = await withServer((_, res) => { res.setHeader("content-type", "application/json"); res.end("{}"); });
    try {
      const p2 = cloudOkc("parasut", { key: "k", url: await s2.url });
      const r2 = await p2.receipt(doc);
      assert.match(r2.ok ? "" : r2.error, /tanınmadı/);
    } finally { s2.server.close(); }
  } finally { s.server.close(); }
});

test("getOkc: bulut sağlayıcı anahtarsız reddeder; fake-okc yola devam; ping künyesi", async () => {
  assert.throws(() => getOkc("parasut", { fakeFail: false }), /API anahtarı ve API adresi gerekli/);
  assert.throws(() => getOkc("uyumsoft", { fakeFail: false, apiKey: "k" }), /API adresi gerekli/);
  assert.throws(() => getOkc("bilinmeyen", { fakeFail: false, apiKey: "k", apiUrl: "http://x" }), /Bilinmeyen ÖKC sağlayıcı/);
  const fake = getOkc("fake-okc", { fakeFail: false });
  const r = await fake.receipt(doc);
  assert.ok(r.ok);
});
