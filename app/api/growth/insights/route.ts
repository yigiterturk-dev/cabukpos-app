import { growthAccess } from "@/lib/growth/access";
import { loadFeaturePack } from "@/lib/growth/feature-pack-data";
import { advise } from "@/lib/growth/provider";

export const dynamic = "force-dynamic";

/** Laya yokken kanıtlı fallback; Laya adaptörü aynı pack sözleşmesini kullanır. */
export async function GET(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const pack = await loadFeaturePack(access.tenantId, access.vertical);
  const advice = await advise(pack);
  return Response.json({ schemaVersion: pack.schemaVersion, generatedAt: pack.generatedAt, ...advice }, { headers: { "Cache-Control": "no-store" } });
}
