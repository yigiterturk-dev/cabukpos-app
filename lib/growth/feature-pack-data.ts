import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { buildFeaturePack, type FeaturePackInput } from "@/lib/growth/feature-pack";

export function loadFeaturePack(tenantId: string, vertical: FeaturePackInput["vertical"]) {
  return withTenant(tenantId, async (tx) => {
    const C = schema.customers, S = schema.sales, E = schema.growthCampaignEvents;
    const d30 = sql<Date>`now() - interval '30 days'`;
    const d90 = sql<Date>`now() - interval '90 days'`;
    const [customers, packageSales, campaigns, events] = await Promise.all([
      Promise.all([
        tx.select({ n: count() }).from(C).where(eq(C.tenantId, tenantId)),
        tx.select({ n: count() }).from(C).where(and(eq(C.tenantId, tenantId), eq(C.marketingConsent, true))),
        tx.select({ n: count() }).from(C).where(and(eq(C.tenantId, tenantId), gte(C.lastOrderAt, d30))),
        tx.select({ n: count() }).from(C).where(and(eq(C.tenantId, tenantId), isNotNull(C.lastOrderAt), lt(C.lastOrderAt, d30))),
        tx.select({ n: count() }).from(C).where(and(eq(C.tenantId, tenantId), eq(C.marketingConsent, true), isNotNull(C.lastOrderAt), lt(C.lastOrderAt, d30))),
        tx.select({ n: count() }).from(C).where(and(eq(C.tenantId, tenantId), gte(C.createdAt, d30))),
      ]),
      tx.select({ orders: count(), gross: sql<number>`coalesce(sum(${S.total}), 0)::int`, avgBasket: sql<number>`coalesce(avg(${S.total}), 0)::int` }).from(S)
        .where(and(eq(S.tenantId, tenantId), eq(S.channel, "paket"), eq(S.status, "kapandi"), gte(S.createdAt, d90))),
      tx.select({ n: count() }).from(schema.growthCampaigns).where(and(eq(schema.growthCampaigns.tenantId, tenantId), eq(schema.growthCampaigns.status, "taslak"))),
      tx.select({ sent: sql<number>`count(distinct ${E.recipientRef}) filter (where ${E.type} = 'sent')::int`, delivered: sql<number>`count(distinct ${E.recipientRef}) filter (where ${E.type} = 'delivered')::int`, converted: sql<number>`count(distinct ${E.recipientRef}) filter (where ${E.type} = 'converted')::int`, revenue: sql<number>`coalesce(sum(greatest(${E.amount}, 0)) filter (where ${E.type} = 'converted'), 0)::int` }).from(E).where(eq(E.tenantId, tenantId)),
    ]);
    return buildFeaturePack({
      generatedAt: new Date().toISOString(), vertical,
      customer: { total: customers[0][0]?.n ?? 0, consented: customers[1][0]?.n ?? 0, active30: customers[2][0]?.n ?? 0, dormant30: customers[3][0]?.n ?? 0, consentedDormant30: customers[4][0]?.n ?? 0, new30: customers[5][0]?.n ?? 0 },
      package90: { orders: packageSales[0]?.orders ?? 0, gross: packageSales[0]?.gross ?? 0, avgBasket: packageSales[0]?.avgBasket ?? 0 },
      campaigns: { drafts: campaigns[0]?.n ?? 0, events: { sent: events[0]?.sent ?? 0, delivered: events[0]?.delivered ?? 0, converted: events[0]?.converted ?? 0, revenue: events[0]?.revenue ?? 0 } },
    });
  });
}
