import { z } from "zod";
import { withTenant } from "@/db";
import { growthAccess } from "@/lib/growth/access";
import { createGrowthCampaignDraft, isGrowthSegment } from "@/lib/growth/campaigns";

export const dynamic = "force-dynamic";

const draftInput = z.object({
  name: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(500),
  segment: z.string().refine(isGrowthSegment, "geçersiz segment"),
});

/** Harici Büyüme Merkezi'nin yalnız taslak oluşturduğu uç; mesaj göndermez. */
export async function POST(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const parsed = draftInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_campaign" }, { status: 400 });
  if (!isGrowthSegment(parsed.data.segment)) return Response.json({ error: "invalid_campaign" }, { status: 400 });
  const result = await withTenant(access.tenantId, (tx) => createGrowthCampaignDraft(tx, { tenantId: access.tenantId, ...parsed.data, segment: parsed.data.segment, actor: access.actor }));
  return Response.json({ ...result, status: "taslak" }, { status: 201 });
}
