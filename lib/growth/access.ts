import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAdmin } from "@/lib/auth/session";
import { keyFromRequest } from "@/lib/integrations/keys";
import { hit } from "@/lib/ratelimit";

export type GrowthAccess = { tenantId: string; vertical: "restoran" | "market" };

/** Yönetici oturumu veya yalnız growth kapsamlı entegrasyon anahtarı. */
export async function growthAccess(req: Request): Promise<GrowthAccess | Response> {
  const a = await getAdmin();
  const key = a ? null : await keyFromRequest(req);
  if (!a && !key) return Response.json({ error: "Kimlik doğrulama gerekli." }, { status: 401 });
  if (key && key.scope !== "growth") return Response.json({ error: "forbidden_scope" }, { status: 403 });
  if (key && (await hit(`apikey:growth:${key.id}`, 1)) > 60) return Response.json({ error: "rate_limited" }, { status: 429 });
  const tenantId = a?.tenantId ?? key!.tenantId;
  const vertical = a?.vertical ?? (await getDb().select({ vertical: schema.tenants.vertical }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1))[0]?.vertical;
  if (!vertical) return Response.json({ error: "tenant_not_found" }, { status: 401 });
  if (vertical !== "restoran") return Response.json({ error: "unsupported_vertical" }, { status: 403 });
  return { tenantId, vertical };
}
