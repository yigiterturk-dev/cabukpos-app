import { withTenant } from "@/db";
import { getAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { courierAccount, courierAccountCsv } from "@/lib/admin/courier-account";
import { isValidCalendarDay, istToday } from "@/lib/core/report";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const a = await getAdmin();
  if (!a) return new Response("Oturum gerekli.", { status: 401, headers });
  const day = new URL(req.url).searchParams.get("day") ?? "";
  if (!isValidCalendarDay(day) || day > istToday() || day < istToday(Date.now(), -366)) return new Response("Geçerli rapor günü seçin.", { status: 400, headers });
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) return new Response("Şube bulunamadı.", { status: 404, headers });
  try {
    return new Response(courierAccountCsv(await courierAccount({ tenantId: a.tenantId, storeId }, day)), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kurye-hesap-${day}.csv"` } });
  } catch { return new Response("Kurye hesabı yüklenemedi.", { status: 503, headers }); }
}
