import { and, eq, gte, gt, isNotNull, lt } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { decodeAudienceCursor, encodeAudienceCursor, recipientRef } from "@/lib/growth/recipient-ref";
import { isGrowthSegment, type GrowthSegment } from "@/lib/growth/segments";

const PAGE_MAX = 500;

export async function loadGrowthCampaignAudience(tx: Tx, input: {
  tenantId: string;
  campaignId: string;
  secret: string;
  cursor?: string;
  limit?: number;
  actor: string;
}) {
  const [campaign] = await tx.select({ id: schema.growthCampaigns.id, segment: schema.growthCampaigns.segment })
    .from(schema.growthCampaigns)
    .where(eq(schema.growthCampaigns.id, input.campaignId)).limit(1);
  if (!campaign || !isGrowthSegment(campaign.segment)) return null;
  const segment = campaign.segment as GrowthSegment;
  const cursor = decodeAudienceCursor(input.cursor);
  if (input.cursor && !cursor) return { error: "invalid_cursor" as const };
  const dormantSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const audienceWhere = segment === "dormant_30"
    ? and(eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, dormantSince))
    : segment === "active_30"
      ? and(eq(schema.customers.marketingConsent, true), gte(schema.customers.lastOrderAt, dormantSince))
      : eq(schema.customers.marketingConsent, true);
  const where = cursor ? and(audienceWhere, gt(schema.customers.id, cursor)) : audienceWhere;
  const limit = Math.min(Math.max(input.limit ?? 100, 1), PAGE_MAX);
  const rows = await tx.select({ id: schema.customers.id, phone: schema.customers.phone })
    .from(schema.customers).where(where).orderBy(schema.customers.id).limit(limit + 1);
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeAudienceCursor(page[page.length - 1].id) : null;
  await audit(tx, input.tenantId, input.actor, "growth.campaign.audience", { campaignId: input.campaignId, count: page.length, hasNext: Boolean(nextCursor), pii: false });
  return {
    campaignId: input.campaignId,
    segment,
    recipients: page.map((row) => ({ recipientRef: recipientRef(input.secret, row.phone) })),
    nextCursor,
    privacy: { pii: false as const, reference: "hmac-sha256" as const, scope: "tenant_only" as const },
  };
}
