import { z } from "zod";
import { withTenant } from "@/db";
import { growthWebhookAccess } from "@/lib/growth/access";
import { loadGrowthCampaignAudience } from "@/lib/growth/audience";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const query = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** İzinli hedefleri yalnız anahtarlı recipientRef olarak döndürür; PII taşımaz. */
export async function GET(req: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await growthWebhookAccess(req);
  if (access instanceof Response) return access;
  const { campaignId } = await context.params;
  if (!z.string().uuid().safeParse(campaignId).success) return Response.json({ error: "invalid_campaign" }, { status: 400 });
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: "invalid_query" }, { status: 400 });
  const result = await withTenant(access.tenantId, (tx) => loadGrowthCampaignAudience(tx, {
    tenantId: access.tenantId,
    campaignId,
    secret: access.credential,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    actor: access.actor,
  }));
  if (!result) return Response.json({ error: "campaign_not_found" }, { status: 404 });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.error === "campaign_not_approved" ? 403 : 400 });
  return Response.json({ schemaVersion: 1, ...result }, { headers: { "Cache-Control": "no-store" } });
}
