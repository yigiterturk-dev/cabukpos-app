export type GrowthEventType = "sent" | "delivered" | "converted" | "opt_out" | "failed";
export type GrowthEvent = { type: GrowthEventType; amount?: number; recipientRef?: string | null };

function refs(events: GrowthEvent[], type: GrowthEventType) {
  return new Set(events.filter((event) => event.type === type && event.recipientRef).map((event) => event.recipientRef as string));
}

function ratio(numerator: Set<string>, denominator: Set<string>) {
  if (numerator.size === 0 || denominator.size === 0 || numerator.size !== [...numerator].filter((ref) => denominator.has(ref)).length) return null;
  return numerator.size / denominator.size;
}

export function campaignMetrics(events: GrowthEvent[]) {
  const sent = events.filter((e) => e.type === "sent").length;
  const delivered = events.filter((e) => e.type === "delivered").length;
  const converted = events.filter((e) => e.type === "converted").length;
  const optOut = events.filter((e) => e.type === "opt_out").length;
  const failed = events.filter((e) => e.type === "failed").length;
  const revenue = events.reduce((sum, e) => sum + (e.type === "converted" ? Math.max(0, e.amount ?? 0) : 0), 0);
  const sentRefs = refs(events, "sent");
  const deliveredRefs = refs(events, "delivered");
  const convertedRefs = refs(events, "converted");
  const optOutRefs = refs(events, "opt_out");
  return {
    sent, delivered, converted, optOut, failed, revenue,
    deliveryRate: ratio(deliveredRefs, sentRefs),
    conversionRate: ratio(convertedRefs, deliveredRefs),
    optOutRate: ratio(optOutRefs, deliveredRefs),
  };
}
