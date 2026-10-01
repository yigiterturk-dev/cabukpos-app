import { and, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { campaignMetrics } from "@/lib/growth/metrics";

export async function loadGrowthCampaignStatus(tx: Tx, input: { tenantId: string; campaignId: string; actor: string }) {
  const [campaign] = await tx.select({ id: schema.growthCampaigns.id, segment: schema.growthCampaigns.segment, audienceCount: schema.growthCampaigns.audienceCount, status: schema.growthCampaigns.status, approvedAt: schema.growthCampaigns.approvedAt, createdAt: schema.growthCampaigns.createdAt }).from(schema.growthCampaigns).where(and(eq(schema.growthCampaigns.id, input.campaignId), eq(schema.growthCampaigns.tenantId, input.tenantId))).limit(1);
  if (!campaign) return null;
  const events = await tx.select({ type: schema.growthCampaignEvents.type, amount: schema.growthCampaignEvents.amount, recipientRef: schema.growthCampaignEvents.recipientRef }).from(schema.growthCampaignEvents).where(and(eq(schema.growthCampaignEvents.campaignId, input.campaignId), eq(schema.growthCampaignEvents.tenantId, input.tenantId))).orderBy(desc(schema.growthCampaignEvents.at));
  await audit(tx, input.tenantId, input.actor, "growth.campaign.read", { id: input.campaignId, eventCount: events.length });
  return { campaign, metrics: campaignMetrics(events.map((event) => ({ type: event.type, amount: event.amount, recipientRef: event.recipientRef }))) };
}
