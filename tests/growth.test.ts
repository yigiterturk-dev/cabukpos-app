import assert from "node:assert/strict";
import test from "node:test";
import { campaignMetrics } from "@/lib/growth/metrics";

test("kampanya sonuçları yalnız dönüşüm olayındaki ciroyu toplar", () => {
  const m = campaignMetrics([
    { type: "sent" }, { type: "delivered" }, { type: "converted", amount: 12500 },
    { type: "delivered" }, { type: "converted", amount: 8000 }, { type: "opt_out" }, { type: "failed" },
  ]);
  assert.deepEqual(m, { sent: 1, delivered: 2, converted: 2, optOut: 1, failed: 1, revenue: 20500, deliveryRate: 2, conversionRate: 1, optOutRate: 0.5 });
});

test("olay yokken oranlar null, ciro sıfırdır", () => {
  assert.deepEqual(campaignMetrics([]), { sent: 0, delivered: 0, converted: 0, optOut: 0, failed: 0, revenue: 0, deliveryRate: null, conversionRate: null, optOutRate: null });
});
