import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const required = {
  DATABASE_URL: "postgres://app:test@localhost/db",
  AUTH_SECRET: "test-auth-secret",
  CRON_SECRET: "test-cron-secret",
  LEGAL_NAME: "Test Şirket",
  LEGAL_ADDRESS: "Test adres",
  LEGAL_EMAIL: "test@example.com",
  LEGAL_PHONE: "+905550000000",
  BILLING_PROVIDER: "paytr",
  PAYTR_MERCHANT_ID: "merchant",
  PAYTR_MERCHANT_KEY: "key",
  PAYTR_MERCHANT_SALT: "salt",
  PAYTR_TEST_MODE: "0",
  PLAN_PRICE_AYLIK: "29900",
  PLAN_PRICE_YILLIK: "299000",
  GROWTH_ADVISOR_URL: "",
  GROWTH_ADVISOR_TOKEN: "",
};

function run(overrides: Record<string, string>) {
  return spawnSync(process.execPath, ["scripts/launch-check.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", ...required, ...overrides },
    encoding: "utf8",
  });
}

function runAsync(overrides: Record<string, string>) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["scripts/launch-check.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production", ...required, ...overrides },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (status: number | null) => resolve({ status, stdout, stderr }));
  });
}

test("launch check production HTTPS ayarlarını kabul eder", () => {
  const result = run({ APP_URL: "https://cabukpos.test", AGENT_ALERT_WEBHOOK_URL: "https://alerts.test/hook", GROWTH_ADVISOR_URL: "https://laya.test/advise", GROWTH_ADVISOR_TOKEN: "test-token" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Launch check başarılı/);
});

test("launch check HTTP veya bozuk URL'yi reddeder", () => {
  const result = run({ APP_URL: "not-a-url", AGENT_ALERT_WEBHOOK_URL: "http://alerts.test/hook", GROWTH_ADVISOR_URL: "http://laya.test/advise", GROWTH_ADVISOR_TOKEN: "test-token", LEGAL_EMAIL: "not-an-email" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Uygulama URL'si: APP_URL geçerli URL olmalı/);
  assert.match(result.stdout, /Agent alarm webhook'u: AGENT_ALERT_WEBHOOK_URL geçerli URL olmalı/);
  assert.match(result.stdout, /Growth\/Laya danışmanı: URL\/token birlikte/);
  assert.match(result.stdout, /Yasal e-posta: LEGAL_EMAIL geçerli e-posta olmalı/);
});

test("launch check production fiyatları olmadan reddeder", () => {
  const result = run({ APP_URL: "https://cabukpos.test", AGENT_ALERT_WEBHOOK_URL: "https://alerts.test/hook", PLAN_PRICE_AYLIK: "", PLAN_PRICE_YILLIK: "" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Aylık plan fiyatı: PLAN_PRICE_AYLIK pozitif tamsayı kuruş tutarı olmalı/);
  assert.match(result.stdout, /Yıllık plan fiyatı: PLAN_PRICE_YILLIK pozitif tamsayı kuruş tutarı olmalı/);
});

test("launch check fake sağlayıcıyı production'da reddeder", () => {
  const result = run({ APP_URL: "https://cabukpos.test", AGENT_ALERT_WEBHOOK_URL: "https://alerts.test/hook", BILLING_PROVIDER: "fake" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Production abonelik sağlayıcısı: BILLING_PROVIDER=paytr olmalı/);
});

test("launch check PayTR test modunu production'da reddeder", () => {
  const result = run({ APP_URL: "https://cabukpos.test", AGENT_ALERT_WEBHOOK_URL: "https://alerts.test/hook", PAYTR_TEST_MODE: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /PayTR canlı modu: PAYTR_TEST_MODE=1 production'da kullanılamaz/);
});

test("launch check isteğe bağlı runtime route doğrulaması yapar", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === "/api/ready") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, checks: { database: "ok" } }));
      return;
    }
    if (request.url === "/yonetim/veriler") {
      response.writeHead(307, { location: "/giris" });
      response.end();
      return;
    }
    if (request.url === "/giris" || request.url === "/kayit") {
      response.writeHead(200);
      response.end("ok");
      return;
    }
    response.writeHead(401);
    response.end("unauthorized");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const result = await runAsync({ NODE_ENV: "test", APP_URL: `http://127.0.0.1:${(address as { port: number }).port}`, LAUNCH_RUNTIME_CHECK: "1" });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Runtime route doğrulaması: health\/ready/);
});

test("runtime audit isteğe bağlı authenticated Growth sözleşmesini doğrular", async () => {
  const server = createServer((request, response) => {
    const growth = request.headers.authorization === "Bearer runtime-key";
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/health") return response.end(JSON.stringify({ ok: true }));
    if (request.url === "/api/ready") return response.end(JSON.stringify({ ok: true, checks: { database: "ok" } }));
    if (request.url === "/yonetim/veriler") { response.writeHead(307, { location: "/giris" }); return response.end(); }
    if (request.url === "/giris" || request.url === "/kayit") { response.writeHead(200); return response.end("ok"); }
    if (request.url === "/api/growth/feature-pack" && growth) return response.end(JSON.stringify({ schemaVersion: 1, privacy: { pii: false, scope: "tenant_only" } }));
    if (request.url === "/api/growth/insights" && growth) return response.end(JSON.stringify({ schemaVersion: 1, insights: [] }));
    if (request.url === "/api/growth/campaigns" && growth) return response.end(JSON.stringify({ schemaVersion: 1, campaigns: [] }));
    response.writeHead(401);
    response.end("unauthorized");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["scripts/runtime-audit.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, BASE: `http://127.0.0.1:${(address as { port: number }).port}`, RUNTIME_GROWTH_KEY: "runtime-key" },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (status: number | null) => resolve({ status, stdout, stderr }));
  });
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS  authenticated growth feature-pack contract/);
  assert.match(result.stdout, /PASS  authenticated growth insights contract/);
  assert.match(result.stdout, /PASS  authenticated growth campaign list contract/);
});
