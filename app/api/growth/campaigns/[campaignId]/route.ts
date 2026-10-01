import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { growthAccess } from "@/lib/growth/access";
import { campaignMetrics } from "@/lib/growth/metrics";

export const dynamic = "force-dynamic";

/** Tenant'a ait tek kampanyanın PII'siz durumu ve ölçümlerini döndürür. */
export async function GET(req: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const { campaignId } = await context.params;
  const data = await withTenant(access.tenantId, async (tx) => {
    const [campaign] = await tx.select({ id: schema.growthCampaigns.id, segment: schema.growthCampaigns.segment, audienceCount: schema.growthCampaigns.audienceCount, status: schema.growthCampaigns.status, createdAt: schema.growthCampaigns.createdAt }).from(schema.growthCampaigns).where(eq(schema.growthCampaigns.id, campaignId)).limit(1);
    if (!campaign) return null;
    const events = await tx.select({ type: schema.growthCampaignEvents.type, amount: schema.growthCampaignEvents.amount }).from(schema.growthCampaignEvents).where(eq(schema.growthCampaignEvents.campaignId, campaignId)).orderBy(desc(schema.growthCampaignEvents.at));
    const metrics = campaignMetrics(events.map((event) => ({ type: event.type, amount: event.amount })));
    await audit(tx, access.tenantId, access.actor, "growth.campaign.read", { id: campaignId, eventCount: events.length });
    return { campaign, metrics };
  });
  if (!data) return Response.json({ error: "campaign_not_found" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
