import { withTenant } from "@/db";
import { growthAccess } from "@/lib/growth/access";
import { loadGrowthCampaignStatus } from "@/lib/growth/campaign-status";

export const dynamic = "force-dynamic";

/** Tenant'a ait tek kampanyanın PII'siz durumu ve ölçümlerini döndürür. */
export async function GET(req: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const { campaignId } = await context.params;
  const data = await withTenant(access.tenantId, (tx) => loadGrowthCampaignStatus(tx, { tenantId: access.tenantId, campaignId, actor: access.actor }));
  if (!data) return Response.json({ error: "campaign_not_found" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
