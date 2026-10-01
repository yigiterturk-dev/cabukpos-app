import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { isGrowthSegment, type GrowthSegment } from "@/lib/growth/segments";

export type GrowthCampaignDraftInput = { tenantId: string; name: string; message: string; segment: GrowthSegment; actor: string; createdBy?: string | null };

/** Tenant transactionı içinde yalnız taslak kampanya oluşturur; iletişim göndermez. */
export async function createGrowthCampaignDraft(tx: Tx, input: GrowthCampaignDraftInput) {
  const audienceWhere = input.segment === "dormant_30"
    ? and(eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, sql`now() - interval '30 days'`))
    : input.segment === "active_30"
      ? and(eq(schema.customers.marketingConsent, true), gte(schema.customers.lastOrderAt, sql`now() - interval '30 days'`))
      : eq(schema.customers.marketingConsent, true);
  const [audience] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(audienceWhere);
  const [campaign] = await tx.insert(schema.growthCampaigns).values({ tenantId: input.tenantId, name: input.name, segment: input.segment, message: input.message, channel: "manual", audienceCount: audience?.n ?? 0, createdBy: input.createdBy ?? null }).returning({ id: schema.growthCampaigns.id });
  await audit(tx, input.tenantId, input.actor, "growth.campaign.draft", { id: campaign.id, segment: input.segment, audienceCount: audience?.n ?? 0 });
  return { id: campaign.id, audienceCount: audience?.n ?? 0 };
}

export { isGrowthSegment };
