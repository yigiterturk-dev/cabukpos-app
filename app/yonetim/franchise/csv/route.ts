// Franchise raporu CSV'si (Türkçe Excel: BOM + ;). Yalnız tüm şubeleri gören yönetim (sahip/HQ).
import { withTenant } from "@/db";
import { requireApiAdmin } from "@/lib/auth/api";
import { seesAllStores } from "@/lib/core/access";
import { parseRange } from "@/lib/core/report";
import { franchiseCsv, franchiseData } from "@/lib/admin/franchise";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await requireApiAdmin(req);
  if (!g.ok) return g.res;
  if (!seesAllStores(g.admin)) return new Response("Yetkisiz.", { status: 403 });
  const q = new URL(req.url).searchParams;
  const r = parseRange(q.get("bas") ?? undefined, q.get("bit") ?? undefined);
  const body = await withTenant(g.admin.tenantId, async (tx) => franchiseCsv(await franchiseData(tx, r)));
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cabukpos-franchise-${r.bas}_${r.bit}.csv"`,
      "cache-control": "no-store",
    },
  });
}
