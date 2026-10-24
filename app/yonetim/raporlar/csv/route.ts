// Rapor CSV'si (Türkçe Excel: BOM + ;). Yalnız yönetim oturumu (sahip/müdür).
import { withTenant } from "@/db";
import { getAdmin } from "@/lib/auth/session";
import { reportCsv } from "@/lib/admin/report";
import { parseRange } from "@/lib/core/report";
import { scopedStoreId } from "@/lib/admin/store-scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await getAdmin();
  if (!a) return new Response("Oturum gerekli.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const sekme = q.get("sekme") ?? "";
  const r = parseRange(q.get("bas") ?? undefined, q.get("bit") ?? undefined);
  const body = await withTenant(a.tenantId, async (tx) => reportCsv(tx, a.tenantId, sekme, r, q.get("kisi"), await scopedStoreId(tx, a.tenantId, a.storeId)));
  if (body === null) return new Response("Bilinmeyen rapor.", { status: 400 });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cabukpos-${sekme}-${r.bas}_${r.bit}.csv"`,
      "cache-control": "no-store",
    },
  });
}
