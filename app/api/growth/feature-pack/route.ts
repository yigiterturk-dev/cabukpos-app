import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getAdmin } from "@/lib/auth/session";
import { buildFeaturePack } from "@/lib/growth/feature-pack";

export const dynamic = "force-dynamic";

/**
 * Laya/harici Büyüme Merkezi adaptörü için PII'siz tenant özeti.
 * İsim, telefon, müşteri/satış/campaign kimliği ve satır detayı döndürmez.
 */
export async function GET() {
  const a = await getAdmin();
  if (!a) return Response.json({ error: "Kimlik doğrulama gerekli." }, { status: 401 });
  const result = await withTenant(a.tenantId, async (tx) => {
    const C = schema.customers, S = schema.sales, E = schema.growthCampaignEvents;
    const d30 = sql<Date>`now() - interval '30 days'`;
    const d90 = sql<Date>`now() - interval '90 days'`;
    const [customers, packageSales, campaigns, events] = await Promise.all([
      Promise.all([
        tx.select({ n: count() }).from(C),
        tx.select({ n: count() }).from(C).where(eq(C.marketingConsent, true)),
        tx.select({ n: count() }).from(C).where(gte(C.lastOrderAt, d30)),
        tx.select({ n: count() }).from(C).where(and(isNotNull(C.lastOrderAt), lt(C.lastOrderAt, d30))),
        tx.select({ n: count() }).from(C).where(gte(C.createdAt, d30)),
      ]),
      tx.select({ orders: count(), gross: sql<number>`coalesce(sum(${S.total}), 0)::int`, avgBasket: sql<number>`coalesce(avg(${S.total}), 0)::int` }).from(S)
        .where(and(eq(S.channel, "paket"), eq(S.status, "kapandi"), gte(S.createdAt, d90))),
      tx.select({ n: count() }).from(schema.growthCampaigns),
      tx.select({ sent: sql<number>`count(*) filter (where ${E.type} = 'sent')::int`, delivered: sql<number>`count(*) filter (where ${E.type} = 'delivered')::int`, converted: sql<number>`count(*) filter (where ${E.type} = 'converted')::int`, revenue: sql<number>`coalesce(sum(${E.amount}) filter (where ${E.type} = 'converted'), 0)::int` }).from(E),
    ]);
    return {
      customer: { total: customers[0][0]?.n ?? 0, consented: customers[1][0]?.n ?? 0, active30: customers[2][0]?.n ?? 0, dormant30: customers[3][0]?.n ?? 0, new30: customers[4][0]?.n ?? 0 },
      package90: { orders: packageSales[0]?.orders ?? 0, gross: packageSales[0]?.gross ?? 0, avgBasket: packageSales[0]?.avgBasket ?? 0 },
      campaigns: { drafts: campaigns[0]?.n ?? 0, events: { sent: events[0]?.sent ?? 0, delivered: events[0]?.delivered ?? 0, converted: events[0]?.converted ?? 0, revenue: events[0]?.revenue ?? 0 } },
    };
  });
  return Response.json(buildFeaturePack({ generatedAt: new Date().toISOString(), vertical: a.vertical, ...result }), { headers: { "Cache-Control": "no-store" } });
}
