import assert from "node:assert/strict";
import test from "node:test";
import { advise } from "@/lib/growth/provider";

test("Laya yapılandırılmamışsa baseline advisor çalışır", async () => {
  const url = process.env.GROWTH_ADVISOR_URL;
  const token = process.env.GROWTH_ADVISOR_TOKEN;
  delete process.env.GROWTH_ADVISOR_URL;
  delete process.env.GROWTH_ADVISOR_TOKEN;
  const result = await advise({ schemaVersion: 1, generatedAt: "2026-10-01T00:00:00.000Z", privacy: { pii: false, minCohortSize: 10 }, vertical: "restoran", customer: { total: 0, consented: 0, active30: 0, dormant30: 0, new30: 0 }, package90: { orders: 0, gross: 0, avgBasket: 0 }, campaigns: { drafts: 0, events: { sent: 0, delivered: 0, converted: 0, revenue: 0 } } });
  assert.equal(result.provider, "baseline");
  assert.equal(result.fallback, "not_configured");
  if (url === undefined) delete process.env.GROWTH_ADVISOR_URL; else process.env.GROWTH_ADVISOR_URL = url;
  if (token === undefined) delete process.env.GROWTH_ADVISOR_TOKEN; else process.env.GROWTH_ADVISOR_TOKEN = token;
});
