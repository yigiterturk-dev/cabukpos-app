// tests/alerts.test.ts — alarm hattı: env kapalıyken ağa çıkmaz; açıkken doğru
// gövdeyi POST eder; uç yavaş/hatalı olsa bile heartbeat'i bozmaz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { dispatchAlert } from "@/lib/observability/alerts";

async function withHook(handler: (body: unknown) => void): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { handler(JSON.parse(raw || "{}")); res.end("ok"); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}/hook`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("alarm: env tanımsızsa hiç istek gitmez (no-op)", async () => {
  delete process.env.AGENT_ALERT_WEBHOOK_URL;
  let called = 0;
  const hook = await withHook(() => { called += 1; });
  try {
    await dispatchAlert("agent.heartbeat.stale", { agentId: "x" });
    assert.equal(called, 0);
  } finally { await hook.close(); }
});

test("alarm: env tanımlıysa service/event/detail gövdesi POST edilir", async () => {
  let raw: unknown = null;
  const hook = await withHook((b) => { raw = b; });
  process.env.AGENT_ALERT_WEBHOOK_URL = hook.url;
  try {
    await dispatchAlert("agent.heartbeat.stale", { agentId: "abc", tenantId: "t1" });
    const body = raw as { service: string; event: string; detail: unknown; at: string } | null;
    assert.ok(body, "webhook gövdesi alınmalı");
    assert.equal(body.service, "cabukpos");
    assert.equal(body.event, "agent.heartbeat.stale");
    assert.deepEqual(body.detail, { agentId: "abc", tenantId: "t1" });
    assert.match(body.at, /^\d{4}-\d{2}-\d{2}T/);
  } finally { delete process.env.AGENT_ALERT_WEBHOOK_URL; await hook.close(); }
});

test("alarm: uç erişilemezse sessizce yutulur (heartbeat bozulmaz)", async () => {
  process.env.AGENT_ALERT_WEBHOOK_URL = "http://127.0.0.1:1/closed"; // kapalı port
  try {
    await assert.doesNotReject(dispatchAlert("agent.heartbeat.stale", { agentId: "x" }));
  } finally { delete process.env.AGENT_ALERT_WEBHOOK_URL; }
});

test("alarm: webhook yoksa e-posta yedeği (RESEND üçlüsüyle) gönderilir", async () => {
  delete process.env.AGENT_ALERT_WEBHOOK_URL;
  process.env.ALERT_EMAIL = "ops@ornek.com";
  process.env.RESEND_API_KEY = "re_x";
  process.env.MAIL_FROM = "alarm@cabukpos.com";
  const original = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await dispatchAlert("fiscal_backlog", { bekleyen: 7 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    const body = calls[0].body as { from: string; to: string[]; subject: string };
    assert.equal(body.from, "alarm@cabukpos.com");
    assert.deepEqual(body.to, ["ops@ornek.com"]);
    assert.match(body.subject, /fiscal_backlog/);
  } finally {
    globalThis.fetch = original;
    for (const k of ["ALERT_EMAIL", "RESEND_API_KEY", "MAIL_FROM"]) delete process.env[k];
  }
});

test("alarm: webhook başarılıysa e-posta yapılmaz; webhook başarısızsa yedeğe düşer; üçlü eksikse sessiz", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  let hookStatus = 200;
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return String(url).includes("resend") ? new Response("{}", { status: 200 }) : new Response("{}", { status: hookStatus });
  }) as typeof fetch;
  process.env.ALERT_EMAIL = "ops@ornek.com";
  process.env.RESEND_API_KEY = "re_x";
  process.env.MAIL_FROM = "alarm@cabukpos.com";
  const hook = await withHook(() => {});
  try {
    process.env.AGENT_ALERT_WEBHOOK_URL = hook.url;
    await dispatchAlert("e1", {});
    assert.deepEqual(calls, [hook.url]); // webhook 200 → e-posta yok
    calls.length = 0;
    hookStatus = 500; // webhook cevabı bozuk → yedeğe düş
    await dispatchAlert("e2", {});
    assert.deepEqual(calls, [hook.url, "https://api.resend.com/emails"]);
    for (const k of ["ALERT_EMAIL", "RESEND_API_KEY", "MAIL_FROM"]) delete process.env[k];
    calls.length = 0;
    hookStatus = 200;
    await dispatchAlert("e3", {});
    assert.deepEqual(calls, [hook.url]); // üçlü yok → webhook var, e-posta yok
  } finally {
    globalThis.fetch = original;
    delete process.env.AGENT_ALERT_WEBHOOK_URL;
    for (const k of ["ALERT_EMAIL", "RESEND_API_KEY", "MAIL_FROM"]) delete process.env[k];
    await hook.close();
  }
});
