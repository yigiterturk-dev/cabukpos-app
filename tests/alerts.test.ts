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
