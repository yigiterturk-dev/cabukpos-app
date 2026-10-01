import { z } from "zod";
import { withTenant } from "@/db";
import { growthAccess } from "@/lib/growth/access";
import { recordCampaignEvent } from "@/lib/growth/events";

export const dynamic = "force-dynamic";

const eventInput = z.object({
  type: z.enum(["sent", "delivered", "converted", "opt_out", "failed"]),
  externalId: z.string().trim().min(1).max(200),
  amount: z.number().int().min(0).max(1_000_000_000).optional(),
  customerId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.type === "opt_out" && !value.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "opt_out için müşteri kimliği gerekli" });
  if (value.type !== "opt_out" && value.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "müşteri kimliği yalnız opt_out için kullanılabilir" });
});

/** Harici iletişim sağlayıcısından yalnızca ölçüm olayı alır; mesaj göndermez. */
export async function POST(req: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const { campaignId } = await context.params;
  if (!z.string().uuid().safeParse(campaignId).success) return Response.json({ error: "invalid_campaign" }, { status: 400 });
  const parsed = eventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_event" }, { status: 400 });

  const result = await withTenant(access.tenantId, (tx) => recordCampaignEvent(tx, { tenantId: access.tenantId, campaignId, ...parsed.data, actor: access.actor }));
  if ("error" in result) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
