import { growthAccess } from "@/lib/growth/access";
import { loadFeaturePack } from "@/lib/growth/feature-pack-data";
import { audit } from "@/lib/audit";
import { withTenant } from "@/db";

export const dynamic = "force-dynamic";

/** PII'siz tenant özeti; isim, telefon ve kimlik döndürmez. */
export async function GET(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const pack = await loadFeaturePack(access.tenantId, access.vertical);
  await withTenant(access.tenantId, (tx) => audit(tx, access.tenantId, access.actor, "growth.feature_pack.read", { schemaVersion: pack.schemaVersion, pii: pack.privacy.pii }));
  return Response.json(pack, { headers: { "Cache-Control": "no-store" } });
}
