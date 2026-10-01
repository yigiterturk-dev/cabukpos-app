export type FeaturePackInput = {
  generatedAt: string;
  vertical: "restoran" | "market";
  customer: { total: number; consented: number; active30: number; dormant30: number; new30: number };
  package90: { orders: number; gross: number; avgBasket: number };
  campaigns: { drafts: number; events: { sent: number; delivered: number; converted: number; revenue: number } };
};

/** Laya sözleşmesi: yalnız toplu sayısal özellikleri seçer; kimlik alanı kabul etmez. */
export function buildFeaturePack(input: FeaturePackInput) {
  return {
    schemaVersion: 1 as const,
    generatedAt: input.generatedAt,
    privacy: { pii: false as const, minCohortSize: 10, scope: "tenant_only" as const },
    vertical: input.vertical,
    customer: input.customer,
    package90: input.package90,
    campaigns: input.campaigns,
  };
}
