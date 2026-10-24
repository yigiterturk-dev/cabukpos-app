import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as dns } from "node:dns";
import { createPublicKey, createPrivateKey, verify, X509Certificate, type KeyObject } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pkcs10CertificateRequest, X509CertificateGenerator } from "@peculiar/x509";
import { ensureCert, loadCert } from "../agent/src/cert";
import * as acme from "@cabukpos/acme-client-native";

const HOST = "agent-fixture.lan.example.test";
const TOKEN = "fixture-agent-token-not-a-secret";

async function localAcme() {
  const keys = await globalThis.crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const signingAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  let base = "", nonce = 0, accountKey: KeyObject | null = null;
  let csr: Pkcs10CertificateRequest | null = null, cert = "", txt: string | null = null, completed = false;
  let orders = 0, signedRequests = 0;
  let mode: "normal" | "unsupported" | "deny" = "normal";
  const dnsCalls: { type: string; value: string | null }[] = [];
  const errors: string[] = [];
  const issuedNonces = new Set<string>();
  const signCert = async (expiresAt: Date) => {
    assert.ok(csr);
    return (await X509CertificateGenerator.create({
      subject: csr.subject, issuer: "CN=Local fixture CA", publicKey: csr.publicKey, signingKey: keys.privateKey,
      signingAlgorithm, notBefore: new Date(Date.now() - 60_000), notAfter: expiresAt, extensions: csr.extensions,
    })).toString("pem");
  };
  const server = http.createServer(async (req, res) => {
    const reply = (status: number, data: unknown, location?: string) => {
      const nextNonce = `fixture-nonce-${++nonce}`;
      issuedNonces.add(nextNonce);
      res.setHeader("replay-nonce", nextNonce);
      res.setHeader("content-type", typeof data === "string" ? "application/pem-certificate-chain" : "application/json");
      if (location) res.setHeader("location", base + location);
      res.writeHead(status).end(typeof data === "string" ? data : JSON.stringify(data));
    };
    try {
      if (req.url === "/directory") return reply(200, { newNonce: base + "/nonce", newAccount: base + "/account", newOrder: base + "/orders" });
      if (req.url === "/nonce") return reply(200, {});
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString();
      if (req.url === "/api/agent/dns") {
        assert.equal(req.headers.authorization, `Bearer ${TOKEN}`);
        if (mode === "unsupported") return reply(501, { error: "DNS not configured" });
        const rec = JSON.parse(raw);
        dnsCalls.push(rec);
        if (mode === "deny" && rec.type === "TXT" && rec.value) return reply(403, { error: "DNS denied" });
        if (rec.type === "TXT") txt = rec.value;
        return reply(200, { name: HOST });
      }
      const jws = JSON.parse(raw);
      const header = JSON.parse(Buffer.from(jws.protected, "base64url").toString());
      assert.equal(header.url, base + req.url);
      assert.equal(header.alg, "RS256");
      assert.ok(issuedNonces.delete(header.nonce), "signed request must use a fresh issued nonce");
      if (header.jwk) accountKey = createPublicKey({ key: header.jwk, format: "jwk" });
      else assert.equal(header.kid, base + "/account/1");
      assert.ok(accountKey);
      assert.ok(verify("sha256", Buffer.from(`${jws.protected}.${jws.payload}`), accountKey, Buffer.from(jws.signature, "base64url")));
      signedRequests++;
      const payload = jws.payload ? JSON.parse(Buffer.from(jws.payload, "base64url").toString()) : null;
      const order = () => ({ status: cert ? "valid" : "pending", identifiers: [{ type: "dns", value: HOST }], authorizations: [base + "/authz/1"], finalize: base + "/finalize/1", ...(cert ? { certificate: base + "/cert/1" } : {}) });
      if (req.url === "/account") return reply(201, { status: "valid" }, "/account/1");
      if (req.url === "/orders") { orders++; completed = false; cert = ""; return reply(201, order(), "/order/1"); }
      if (req.url === "/authz/1") return reply(200, { status: payload?.status ?? "pending", identifier: { type: "dns", value: HOST }, challenges: [{ type: "dns-01", url: base + "/challenge/1", token: "fixture-challenge", status: completed ? "valid" : "pending" }] });
      if (req.url === "/challenge/1") { completed = true; return reply(200, { status: "valid", type: "dns-01", url: base + "/challenge/1", token: "fixture-challenge" }); }
      if (req.url === "/finalize/1") {
        csr = new Pkcs10CertificateRequest(Buffer.from(payload.csr, "base64url"));
        assert.ok(await csr.verify(), "native CSR signature must verify");
        cert = await signCert(new Date(Date.now() + 90 * 86_400_000));
        return reply(200, order());
      }
      if (req.url === "/order/1") return reply(200, order());
      if (req.url === "/cert/1") return reply(200, cert);
      reply(404, { error: "Unknown fixture endpoint" });
    } catch (error) {
      errors.push(String(error));
      reply(400, { type: "urn:ietf:params:acme:error:malformed", detail: "Fixture assertion failed" });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const cnameMock = mock.method(dns, "resolveCname", async () => { throw Object.assign(new Error("No CNAME"), { code: "ENODATA" }); });
  const txtMock = mock.method(dns, "resolveTxt", async (name: string) => { assert.equal(name, `_acme-challenge.${HOST}`); return txt ? [[txt]] : []; });
  return {
    base, keys, dnsCalls, errors, signCert,
    orders: () => orders, signedRequests: () => signedRequests,
    setMode: (value: typeof mode) => { mode = value; },
    close: async () => { cnameMock.mock.restore(); txtMock.mock.restore(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

test("ajan sertifikası: gerçek JWS/CSR imzalarıyla yerel ACME DNS-01 kesim, cache ve yenileme", { timeout: 20000 }, async () => {
  const ca = await localAcme();
  const dir = await mkdtemp(path.join(tmpdir(), "cabukpos-native-acme-"));
  const oldDirectory = process.env.ACME_DIRECTORY;
  process.env.ACME_DIRECTORY = ca.base + "/directory";
  try {
    const logs: string[] = [];
    const state = { cloudUrl: ca.base, token: TOKEN };
    const tls = await ensureCert(dir, state, "192.168.1.10", (line) => logs.push(line));
    assert.ok(tls, JSON.stringify({ logs, errors: ca.errors }));
    const certificate = new X509Certificate(tls.cert);
    assert.ok(certificate.checkPrivateKey(createPrivateKey(tls.key)));
    assert.match(certificate.subjectAltName ?? "", /agent-fixture\.lan\.example\.test/);
    assert.ok(tls.expiresAt.getTime() > Date.now() + 80 * 86_400_000);
    assert.ok(ca.signedRequests() >= 5);
    assert.ok(ca.dnsCalls.some((r) => r.type === "TXT" && r.value));
    assert.equal(ca.dnsCalls.at(-1)?.value, null, "DNS challenge should be cleaned up");
    const accountKey = await readFile(path.join(dir, "acme-account.key"), "utf8");
    assert.equal((await ensureCert(dir, state, null, () => {}))?.cert, tls.cert);
    assert.equal(ca.orders(), 1, "healthy cache must not issue again");
    await writeFile(path.join(dir, "lan.crt"), await ca.signCert(new Date(Date.now() + 86_400_000)));
    assert.ok(await ensureCert(dir, state, null, () => {}));
    assert.equal(ca.orders(), 2, "near-expiry certificate must renew");
    assert.equal(await readFile(path.join(dir, "acme-account.key"), "utf8"), accountKey);
    const renewed = loadCert(dir);
    assert.ok(renewed);
    await writeFile(path.join(dir, "lan.key"), await acme.crypto.createPrivateKey());
    assert.equal(loadCert(dir), null, "certificate/private-key mismatch must be rejected");
    await writeFile(path.join(dir, "lan.key"), renewed.key);
    await writeFile(path.join(dir, "lan.crt"), await ca.signCert(new Date(Date.now() - 1000)));
    assert.equal(loadCert(dir), null, "expired certificate must not be served");
    await writeFile(path.join(dir, "lan.crt"), "invalid-certificate");
    assert.equal(loadCert(dir), null);
    assert.deepEqual(ca.errors, []);
  } finally {
    if (oldDirectory === undefined) delete process.env.ACME_DIRECTORY; else process.env.ACME_DIRECTORY = oldDirectory;
    await ca.close(); await rm(dir, { recursive: true, force: true });
  }
});

test("ajan sertifikası: DNS kapalı/reddedilmişse sertifika üretmez; token loga yazılmaz", { timeout: 20000 }, async () => {
  const ca = await localAcme();
  const dir = await mkdtemp(path.join(tmpdir(), "cabukpos-native-denied-"));
  const oldDirectory = process.env.ACME_DIRECTORY;
  process.env.ACME_DIRECTORY = ca.base + "/directory";
  try {
    ca.setMode("unsupported");
    assert.equal(await ensureCert(dir, { cloudUrl: ca.base, token: TOKEN }, "192.168.1.10", () => {}), null);
    assert.equal(ca.orders(), 0);
    ca.setMode("deny");
    const logs: string[] = [];
    assert.equal(await ensureCert(dir, { cloudUrl: ca.base, token: TOKEN }, null, (line) => logs.push(line)), null);
    assert.ok(logs.some((line) => line.includes("DNS denied")));
    assert.ok(logs.every((line) => !line.includes(TOKEN)));
    assert.equal(loadCert(dir), null);
    assert.deepEqual(ca.errors, []);
  } finally {
    if (oldDirectory === undefined) delete process.env.ACME_DIRECTORY; else process.env.ACME_DIRECTORY = oldDirectory;
    await ca.close(); await rm(dir, { recursive: true, force: true });
  }
});
