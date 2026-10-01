import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { growthAccess } from "@/lib/growth/access";

export const dynamic = "force-dynamic";

const eventInput = z.object({
  type: z.enum(["sent", "delivered", "converted", "opt_out", "failed"]),
  externalId: z.string().trim().min(1).max(200),
  amount: z.number().int().min(0).max(1_000_000_000).optional(),
});

/** Harici iletişim sağlayıcısından yalnızca ölçüm olayı alır; mesaj göndermez. */
export async function POST(req: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const { campaignId } = await context.params;
  if (!z.string().uuid().safeParse(campaignId).success) return Response.json({ error: "invalid_campaign" }, { status: 400 });
  const parsed = eventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_event" }, { status: 400 });

  const result = await withTenant(access.tenantId, async (tx) => {
    const [campaign] = await tx.select({ id: schema.growthCampaigns.id }).from(schema.growthCampaigns)
      .where(and(eq(schema.growthCampaigns.id, campaignId), eq(schema.growthCampaigns.tenantId, access.tenantId))).limit(1);
    if (!campaign) return { error: "campaign_not_found" as const };
    const amount = parsed.data.type === "converted" ? parsed.data.amount ?? 0 : 0;
    const [inserted] = await tx.insert(schema.growthCampaignEvents).values({
      tenantId: access.tenantId, campaignId, type: parsed.data.type, externalId: parsed.data.externalId, amount,
    }).onConflictDoNothing({ target: [schema.growthCampaignEvents.campaignId, schema.growthCampaignEvents.externalId] }).returning({ id: schema.growthCampaignEvents.id });
    if (!inserted) return { duplicate: true as const };
    await audit(tx, access.tenantId, access.actor, "growth.campaign.event", { campaignId, type: parsed.data.type, amount });
    return { id: inserted.id, duplicate: false as const };
  });
  if ("error" in result) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
