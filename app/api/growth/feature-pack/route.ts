import { growthAccess } from "@/lib/growth/access";
import { loadFeaturePack } from "@/lib/growth/feature-pack-data";

export const dynamic = "force-dynamic";

/** PII'siz tenant özeti; isim, telefon ve kimlik döndürmez. */
export async function GET(req: Request) {
  const access = await growthAccess(req);
  if (access instanceof Response) return access;
  const pack = await loadFeaturePack(access.tenantId, access.vertical);
  return Response.json(pack, { headers: { "Cache-Control": "no-store" } });
}
