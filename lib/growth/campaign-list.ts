import { desc, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { campaignMetrics } from "@/lib/growth/metrics";

/** Tenant içindeki son kampanyaları PII'siz özetleriyle döndürür. */
export async function listGrowthCampaigns(tx: Tx, input: { tenantId: string; actor: string }) {
  const campaigns = await tx.select({
    id: schema.growthCampaigns.id,
    name: schema.growthCampaigns.name,
    segment: schema.growthCampaigns.segment,
    status: schema.growthCampaigns.status,
    audienceCount: schema.growthCampaigns.audienceCount,
    createdAt: schema.growthCampaigns.createdAt,
  }).from(schema.growthCampaigns).orderBy(desc(schema.growthCampaigns.createdAt)).limit(50);
  const ids = campaigns.map((campaign) => campaign.id);
  const events = ids.length === 0 ? [] : await tx.select({
    campaignId: schema.growthCampaignEvents.campaignId,
    type: schema.growthCampaignEvents.type,
    amount: schema.growthCampaignEvents.amount,
  }).from(schema.growthCampaignEvents).where(inArray(schema.growthCampaignEvents.campaignId, ids));
  const byCampaign = new Map<string, typeof events>();
  for (const event of events) byCampaign.set(event.campaignId, [...(byCampaign.get(event.campaignId) ?? []), event]);
  await audit(tx, input.tenantId, input.actor, "growth.campaign.list", { count: campaigns.length });
  return campaigns.map((campaign) => ({
    ...campaign,
    metrics: campaignMetrics((byCampaign.get(campaign.id) ?? []).map(({ type, amount }) => ({ type, amount }))),
  }));
}
