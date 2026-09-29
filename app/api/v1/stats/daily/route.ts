// Ajans API'si (M9c): GET /api/v1/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD, Authorization: Bearer cpk_…
// Abonelik kilidinde de çalışır (veri müşterinin). Anahtar başına dakikada 60 istek.
import { withTenant } from "@/db";
import { keyFromRequest } from "@/lib/integrations/keys";
import { hit } from "@/lib/ratelimit";
import { apiRange, API_MAX_DAYS } from "@/lib/core/report";
import { dailyStatsData } from "@/lib/admin/report";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const k = await keyFromRequest(req);
  if (!k) return Response.json({ error: "unauthorized" }, { status: 401 });
  if ((await hit(`apikey:${k.id}`, 1)) > 60) return Response.json({ error: "rate_limited" }, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const r = apiRange(sp.get("from"), sp.get("to"));
  if (!r) return Response.json({ error: "invalid_range", maxDays: API_MAX_DAYS }, { status: 400 });
  const days = await withTenant(k.tenantId, (tx) => dailyStatsData(tx, r));
  return Response.json({ business: { name: k.tenantName }, days });
}
