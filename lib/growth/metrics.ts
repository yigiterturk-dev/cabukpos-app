export type GrowthEventType = "sent" | "delivered" | "converted" | "opt_out" | "failed";
export type GrowthEvent = { type: GrowthEventType; amount?: number };

export function campaignMetrics(events: GrowthEvent[]) {
  const sent = events.filter((e) => e.type === "sent").length;
  const delivered = events.filter((e) => e.type === "delivered").length;
  const converted = events.filter((e) => e.type === "converted").length;
  const optOut = events.filter((e) => e.type === "opt_out").length;
  const failed = events.filter((e) => e.type === "failed").length;
  const revenue = events.reduce((sum, e) => sum + (e.type === "converted" ? Math.max(0, e.amount ?? 0) : 0), 0);
  return {
    sent, delivered, converted, optOut, failed, revenue,
    deliveryRate: sent ? delivered / sent : null,
    conversionRate: delivered ? converted / delivered : null,
    optOutRate: delivered ? optOut / delivered : null,
  };
}
