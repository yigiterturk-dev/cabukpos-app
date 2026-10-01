import { growthAccess } from "@/lib/growth/access";
import { loadFeaturePack } from "@/lib/growth/feature-pack-data";
import { advise } from "@/lib/growth/provider";
import { audit } from "@/lib/audit";
import { withTenant } from "@/db";

export const dynamic = "force-dynamic";

/** Laya yokken kanıtlı fallback; Laya adaptörü aynı pack sözleşmesini kullanır. */
export async function GET(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const pack = await loadFeaturePack(access.tenantId, access.vertical);
  const advice = await advise(pack);
  await withTenant(access.tenantId, (tx) => audit(tx, access.tenantId, access.actor, "growth.advisor.request", { provider: advice.provider, fallback: advice.fallback ?? null, schemaVersion: pack.schemaVersion, pii: pack.privacy.pii }));
  return Response.json({ schemaVersion: pack.schemaVersion, generatedAt: pack.generatedAt, ...advice }, { headers: { "Cache-Control": "no-store" } });
}
