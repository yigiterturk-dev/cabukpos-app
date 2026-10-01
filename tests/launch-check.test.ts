import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const required = {
  DATABASE_URL: "postgres://app:test@localhost/db",
  AUTH_SECRET: "test-auth-secret",
  CRON_SECRET: "test-cron-secret",
  LEGAL_NAME: "Test Şirket",
  LEGAL_ADDRESS: "Test adres",
  LEGAL_EMAIL: "test@example.com",
  LEGAL_PHONE: "+905550000000",
  BILLING_PROVIDER: "fake",
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

test("launch check production HTTPS ayarlarını kabul eder", () => {
  const result = run({ APP_URL: "https://cabukpos.test", AGENT_ALERT_WEBHOOK_URL: "https://alerts.test/hook", GROWTH_ADVISOR_URL: "https://laya.test/advise", GROWTH_ADVISOR_TOKEN: "test-token" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Launch check başarılı/);
});

test("launch check HTTP veya bozuk URL'yi reddeder", () => {
  const result = run({ APP_URL: "not-a-url", AGENT_ALERT_WEBHOOK_URL: "http://alerts.test/hook", GROWTH_ADVISOR_URL: "http://laya.test/advise", GROWTH_ADVISOR_TOKEN: "test-token" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Uygulama URL'si: APP_URL geçerli URL olmalı/);
  assert.match(result.stdout, /Agent alarm webhook'u: AGENT_ALERT_WEBHOOK_URL geçerli URL olmalı/);
  assert.match(result.stdout, /Growth\/Laya danışmanı: URL\/token birlikte/);
});
