import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";

export async function approveGrowthCampaign(tx: Tx, input: { tenantId: string; campaignId: string; approvedBy: string; actor: string }) {
  const [campaign] = await tx.update(schema.growthCampaigns)
    .set({ approvedBy: input.approvedBy, approvedAt: new Date() })
    .where(and(eq(schema.growthCampaigns.id, input.campaignId), eq(schema.growthCampaigns.tenantId, input.tenantId), eq(schema.growthCampaigns.status, "taslak"), isNull(schema.growthCampaigns.approvedAt)))
    .returning({ id: schema.growthCampaigns.id, approvedAt: schema.growthCampaigns.approvedAt });
  if (!campaign) return null;
  await audit(tx, input.tenantId, input.actor, "growth.campaign.approve", { id: campaign.id });
  return campaign;
}
