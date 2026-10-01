import assert from "node:assert/strict";
import test from "node:test";
import { buildFeaturePack } from "@/lib/growth/feature-pack";

test("feature pack tenant kimliği ve PII içermez", () => {
  const pack = buildFeaturePack({
    generatedAt: "2026-10-01T00:00:00.000Z", vertical: "restoran",
    customer: { total: 5, consented: 3, active30: 2, dormant30: 3, consentedDormant30: 1, new30: 1 },
    package90: { orders: 10, gross: 100000, avgBasket: 10000 },
    campaigns: { drafts: 1, events: { sent: 0, delivered: 0, converted: 0, revenue: 0 } },
  });
  assert.deepEqual(Object.keys(pack).sort(), ["campaigns", "customer", "generatedAt", "package90", "privacy", "schemaVersion", "vertical"]);
  assert.equal("tenantId" in pack, false);
  assert.equal(pack.privacy.pii, false);
});
