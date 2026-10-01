import assert from "node:assert/strict";
import test from "node:test";
import { advise } from "@/lib/growth/provider";

test("Laya yapılandırılmamışsa baseline advisor çalışır", async () => {
  const url = process.env.GROWTH_ADVISOR_URL;
  const token = process.env.GROWTH_ADVISOR_TOKEN;
  delete process.env.GROWTH_ADVISOR_URL;
  delete process.env.GROWTH_ADVISOR_TOKEN;
  const result = await advise({ schemaVersion: 1, generatedAt: "2026-10-01T00:00:00.000Z", privacy: { pii: false, minCohortSize: 10, scope: "tenant_only" }, vertical: "restoran", customer: { total: 0, consented: 0, active30: 0, dormant30: 0, consentedDormant30: 0, new30: 0 }, package90: { orders: 0, gross: 0, avgBasket: 0 }, campaigns: { drafts: 0, events: { sent: 0, delivered: 0, converted: 0, revenue: 0 } } });
  assert.equal(result.provider, "baseline");
  assert.equal(result.fallback, "not_configured");
  if (url === undefined) delete process.env.GROWTH_ADVISOR_URL; else process.env.GROWTH_ADVISOR_URL = url;
  if (token === undefined) delete process.env.GROWTH_ADVISOR_TOKEN; else process.env.GROWTH_ADVISOR_TOKEN = token;
});

const samplePack = { schemaVersion: 1 as const, generatedAt: "2026-10-01T00:00:00.000Z", privacy: { pii: false as const, minCohortSize: 10, scope: "tenant_only" as const }, vertical: "restoran" as const, customer: { total: 2, consented: 1, active30: 1, dormant30: 1, consentedDormant30: 1, new30: 0 }, package90: { orders: 2, gross: 20000, avgBasket: 10000 }, campaigns: { drafts: 1, events: { sent: 2, delivered: 2, converted: 1, revenue: 10000 } } };

test("geçerli Laya cevabı doğrulanır, bozuk cevap baseline'a döner", async () => {
  const oldUrl = process.env.GROWTH_ADVISOR_URL, oldToken = process.env.GROWTH_ADVISOR_TOKEN, oldFetch = globalThis.fetch;
  process.env.GROWTH_ADVISOR_URL = "http://laya.test/advise";
  process.env.GROWTH_ADVISOR_TOKEN = "test-token";
  globalThis.fetch = async () => new Response(JSON.stringify({ insights: [{ key: "remote", kind: "observation", title: "Ölçüm", body: "Kanıtlı gözlem", confidence: "observed", evidence: { orders90: 2 } }] }), { status: 200, headers: { "content-type": "application/json" } });
  const remote = await advise(samplePack);
  assert.equal(remote.provider, "laya");
  assert.equal(remote.insights[0]?.key, "remote");
  globalThis.fetch = async () => new Response(JSON.stringify({ insights: [{ key: "stale", kind: "observation", title: "Eski", body: "POS ile eşleşmeyen kanıt", confidence: "observed", evidence: { orders90: 999 } }] }), { status: 200 });
  const staleEvidence = await advise(samplePack);
  assert.equal(staleEvidence.provider, "baseline");
  assert.equal(staleEvidence.fallback, "remote_error");
  globalThis.fetch = async () => new Response(JSON.stringify({ wrong: true }), { status: 200 });
  const fallback = await advise(samplePack);
  assert.equal(fallback.provider, "baseline");
  assert.equal(fallback.fallback, "remote_error");
  globalThis.fetch = async () => new Response("x".repeat(64_001), { status: 200 });
  const oversized = await advise(samplePack);
  assert.equal(oversized.provider, "baseline");
  assert.equal(oversized.fallback, "remote_error");
  globalThis.fetch = async () => new Response(JSON.stringify({ insights: [{ key: "invented", kind: "observation", title: "Bilinmeyen", body: "Bilinmeyen metrik", confidence: "observed", evidence: { inventedMetric: 1 } }] }), { status: 200 });
  const unknownEvidence = await advise(samplePack);
  assert.equal(unknownEvidence.provider, "baseline");
  assert.equal(unknownEvidence.fallback, "remote_error");
  globalThis.fetch = oldFetch;
  if (oldUrl === undefined) delete process.env.GROWTH_ADVISOR_URL; else process.env.GROWTH_ADVISOR_URL = oldUrl;
  if (oldToken === undefined) delete process.env.GROWTH_ADVISOR_TOKEN; else process.env.GROWTH_ADVISOR_TOKEN = oldToken;
});
