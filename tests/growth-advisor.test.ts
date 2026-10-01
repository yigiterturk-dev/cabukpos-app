import assert from "node:assert/strict";
import test from "node:test";
import { baselineAdvisor } from "@/lib/growth/advisor";

const pack = (overrides = {}) => ({ schemaVersion: 1 as const, generatedAt: "2026-10-01T00:00:00.000Z", privacy: { pii: false as const, minCohortSize: 10, scope: "tenant_only" as const }, vertical: "restoran" as const, customer: { total: 10, consented: 4, active30: 2, dormant30: 3, new30: 1 }, package90: { orders: 8, gross: 80000, avgBasket: 10000 }, campaigns: { drafts: 1, events: { sent: 0, delivered: 0, converted: 0, revenue: 0 } }, ...overrides });

test("baseline advisor yalnız gözlenen veriden içgörü üretir", () => {
  const insights = baselineAdvisor(pack());
  assert.equal(insights.find((x) => x.key === "dormant-consented")?.confidence, "observed");
  assert.equal(insights.find((x) => x.key === "campaign-learning")?.confidence, "insufficient_data");
  assert.equal(insights.some((x) => x.body.includes("kesin")), false);
});

test("dönüşüm yoksa ciro tahmini yoktur", () => {
  const insights = baselineAdvisor(pack({ package90: { orders: 0, gross: 0, avgBasket: 0 } }));
  assert.equal(insights.find((x) => x.key === "package-insufficient")?.confidence, "insufficient_data");
  assert.equal(insights.find((x) => x.key === "campaign-learning")?.confidence, "insufficient_data");
});
