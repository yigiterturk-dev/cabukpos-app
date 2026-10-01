import { z } from "zod";
import { withTenant } from "@/db";
import { growthAccess } from "@/lib/growth/access";
import { createGrowthCampaignDraft, isGrowthSegment } from "@/lib/growth/campaigns";
import { listGrowthCampaigns } from "@/lib/growth/campaign-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const draftInput = z.object({
  name: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(500),
  segment: z.string().refine(isGrowthSegment, "geçersiz segment"),
});

/** Harici Büyüme Merkezi'nin tenant içindeki kampanya durumlarını okuduğu uç. */
export async function GET(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const campaigns = await withTenant(access.tenantId, (tx) => listGrowthCampaigns(tx, { tenantId: access.tenantId, actor: access.actor }));
  return Response.json({ schemaVersion: 1, campaigns }, { headers: { "Cache-Control": "no-store" } });
}

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
