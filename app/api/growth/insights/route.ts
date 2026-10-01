import { growthAccess } from "@/lib/growth/access";
import { baselineAdvisor } from "@/lib/growth/advisor";
import { loadFeaturePack } from "@/lib/growth/feature-pack-data";

export const dynamic = "force-dynamic";

/** Laya yokken kanıtlı fallback; Laya adaptörü aynı pack sözleşmesini kullanır. */
export async function GET(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const pack = await loadFeaturePack(access.tenantId, access.vertical);
  return Response.json({ schemaVersion: pack.schemaVersion, generatedAt: pack.generatedAt, provider: "baseline", insights: baselineAdvisor(pack) }, { headers: { "Cache-Control": "no-store" } });
}
