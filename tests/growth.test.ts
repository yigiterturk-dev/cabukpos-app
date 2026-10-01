import assert from "node:assert/strict";
import test from "node:test";
import { campaignMetrics } from "@/lib/growth/metrics";

test("kampanya sonuçları yalnız dönüşüm olayındaki ciroyu toplar", () => {
  const r1 = "hmac-sha256:" + "a".repeat(64);
  const r2 = "hmac-sha256:" + "b".repeat(64);
  const r3 = "hmac-sha256:" + "c".repeat(64);
  const m = campaignMetrics([
    { type: "sent", recipientRef: r1 }, { type: "delivered", recipientRef: r1 }, { type: "converted", recipientRef: r1, amount: 12500 },
    { type: "delivered", recipientRef: r2 }, { type: "converted", recipientRef: r2, amount: 8000 }, { type: "opt_out", recipientRef: r2 }, { type: "failed", recipientRef: r3 },
  ]);
  assert.deepEqual(m, { sent: 1, delivered: 2, converted: 2, optOut: 1, failed: 1, revenue: 20500, deliveryRate: null, conversionRate: 1, optOutRate: 0.5 });
});

test("olay yokken oranlar null, ciro sıfırdır", () => {
  assert.deepEqual(campaignMetrics([]), { sent: 0, delivered: 0, converted: 0, optOut: 0, failed: 0, revenue: 0, deliveryRate: null, conversionRate: null, optOutRate: null });
});
