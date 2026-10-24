// app/api/yonetim/muhasebe/route.ts — #20: ayın yevmiyesini sağlayıcı CSV'si olarak indirir (sahip/müdür).
import { requireApiAdmin, apiRole } from "@/lib/auth/api";
import { seesAllStores } from "@/lib/core/access";
import { isAccountingProvider, toProviderCsv, type AccountingProvider } from "@/lib/core/accounting";
import { monthlyAccountingJournal } from "@/lib/admin/accounting";
import { withTenant } from "@/db";

export const dynamic = "force-dynamic";

const FILENAME: Record<AccountingProvider, string> = { parasut: "parasut", logo: "logo", mikro: "mikro", edefter: "edefter-yevmiye" };

export async function GET(req: Request) {
  const g = await requireApiAdmin(req);
  if (!g.ok) return g.res;
  const denied = apiRole(g.admin, ["sahip", "mudur"]);
  if (denied) return denied;
  if (!seesAllStores(g.admin)) return new Response("Yetkisiz.", { status: 403 });
  const a = g.admin;

  const url = new URL(req.url);
  const now = new Date(Date.now() + 3 * 3600_000);
  const m = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get("aylik") ?? "");
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) : now.getUTCMonth() + 1;
  const format = url.searchParams.get("format") ?? "parasut";
  if (!Number.isInteger(year) || year < 2020 || year > now.getUTCFullYear() + 1) return new Response("Geçersiz yıl.", { status: 400 });
  if (!Number.isInteger(month) || month < 1 || month > 12) return new Response("Geçersiz ay.", { status: 400 });
  if (!isAccountingProvider(format)) return new Response("Geçersiz format.", { status: 400 });

  const entries = await withTenant(a.tenantId, (tx) => monthlyAccountingJournal(tx, { tenantId: a.tenantId, year, month, actor: `user:${a.id}` }));
  const csv = toProviderCsv(entries, format);
  const stamp = `${year}-${String(month).padStart(2, "0")}`;
  return new Response("\uFEFF" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cabukpos-${FILENAME[format]}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
