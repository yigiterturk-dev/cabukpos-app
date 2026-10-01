import { desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { campaignMetrics } from "@/lib/growth/metrics";

/** Tenant içindeki son kampanyaları PII'siz özetleriyle döndürür. */
export async function listGrowthCampaigns(tx: Tx, input: { tenantId: string; actor: string }) {
  const campaigns = await tx.select({
    id: schema.growthCampaigns.id,
    segment: schema.growthCampaigns.segment,
    status: schema.growthCampaigns.status,
    audienceCount: schema.growthCampaigns.audienceCount,
    approvedAt: schema.growthCampaigns.approvedAt,
    createdAt: schema.growthCampaigns.createdAt,
  }).from(schema.growthCampaigns).where(eq(schema.growthCampaigns.tenantId, input.tenantId)).orderBy(desc(schema.growthCampaigns.createdAt)).limit(50);
  const ids = campaigns.map((campaign) => campaign.id);
  const campaignIds = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const aggregates = ids.length === 0 ? [] : await tx.execute<{
    campaignId: string;
    sent: number;
    delivered: number;
    converted: number;
    optOut: number;
    failed: number;
    revenue: number;
    sentRefs: number;
    deliveredRefs: number;
    convertedRefs: number;
    optOutRefs: number;
    deliveredInvalid: number;
    convertedInvalid: number;
    optOutInvalid: number;
  }>(sql`
    select
      e.campaign_id as "campaignId",
      (count(distinct e.recipient_ref) filter (where e.type = 'sent' and e.recipient_ref is not null) + count(*) filter (where e.type = 'sent' and e.recipient_ref is null))::int as sent,
      (count(distinct e.recipient_ref) filter (where e.type = 'delivered' and e.recipient_ref is not null) + count(*) filter (where e.type = 'delivered' and e.recipient_ref is null))::int as delivered,
      (count(distinct e.recipient_ref) filter (where e.type = 'converted' and e.recipient_ref is not null) + count(*) filter (where e.type = 'converted' and e.recipient_ref is null))::int as converted,
      (count(distinct e.recipient_ref) filter (where e.type = 'opt_out' and e.recipient_ref is not null) + count(*) filter (where e.type = 'opt_out' and e.recipient_ref is null))::int as "optOut",
      count(*) filter (where e.type = 'failed')::int as failed,
      coalesce(sum(greatest(e.amount, 0)) filter (where e.type = 'converted'), 0)::int as revenue,
      count(distinct e.recipient_ref) filter (where e.type = 'sent')::int as "sentRefs",
      count(distinct e.recipient_ref) filter (where e.type = 'delivered')::int as "deliveredRefs",
      count(distinct e.recipient_ref) filter (where e.type = 'converted')::int as "convertedRefs",
      count(distinct e.recipient_ref) filter (where e.type = 'opt_out')::int as "optOutRefs",
      count(distinct e.recipient_ref) filter (where e.type = 'delivered' and e.recipient_ref is not null and not exists (
        select 1 from growth_campaign_events s
        where s.tenant_id = e.tenant_id and s.campaign_id = e.campaign_id and s.type = 'sent' and s.recipient_ref = e.recipient_ref
      ))::int as "deliveredInvalid",
      count(distinct e.recipient_ref) filter (where e.type = 'converted' and e.recipient_ref is not null and not exists (
        select 1 from growth_campaign_events d
        where d.tenant_id = e.tenant_id and d.campaign_id = e.campaign_id and d.type = 'delivered' and d.recipient_ref = e.recipient_ref
      ))::int as "convertedInvalid",
      count(distinct e.recipient_ref) filter (where e.type = 'opt_out' and e.recipient_ref is not null and not exists (
        select 1 from growth_campaign_events d
        where d.tenant_id = e.tenant_id and d.campaign_id = e.campaign_id and d.type = 'delivered' and d.recipient_ref = e.recipient_ref
      ))::int as "optOutInvalid"
    from growth_campaign_events e
    where e.tenant_id = ${input.tenantId} and e.campaign_id in (${campaignIds})
    group by e.campaign_id
  `);
  const byCampaign = new Map(aggregates.map((row) => [row.campaignId, row]));
  const rate = (numerator: number, denominator: number, invalid: number) => numerator === 0 || denominator === 0 || invalid > 0 ? null : numerator / denominator;
  await audit(tx, input.tenantId, input.actor, "growth.campaign.list", { count: campaigns.length });
  return campaigns.map((campaign) => ({
    ...campaign,
    metrics: (() => {
      const row = byCampaign.get(campaign.id);
      if (!row) return campaignMetrics([]);
      return {
        sent: row.sent, delivered: row.delivered, converted: row.converted, optOut: row.optOut, failed: row.failed, revenue: row.revenue,
        deliveryRate: rate(row.deliveredRefs, row.sentRefs, row.deliveredInvalid),
        conversionRate: rate(row.convertedRefs, row.deliveredRefs, row.convertedInvalid),
        optOutRate: rate(row.optOutRefs, row.deliveredRefs, row.optOutInvalid),
      };
    })(),
  }));
}
