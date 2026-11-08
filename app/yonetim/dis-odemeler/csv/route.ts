// Dış ödemeler CSV (Türkçe Excel: BOM + ;). Yalnız yönetim oturumu.
import { and, desc, gte, lt } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getAdmin } from "@/lib/auth/session";
import { paymentMonth } from "@/lib/integrations/payments";
import { formatMoney, isCurrency } from "@/lib/core/money";
import { toCsv } from "@/lib/core/report";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { nakit: "Nakit", kart: "Kart", havale: "Havale", other: "Diğer" };
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });

export async function GET(req: Request) {
  const a = await getAdmin();
  if (!a) return new Response("Oturum gerekli.", { status: 401 });
  const { label, from, to } = paymentMonth(new URL(req.url).searchParams.get("ay"));
  const [rows, stores] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(schema.externalPayments)
      .where(and(gte(schema.externalPayments.paidAt, from), lt(schema.externalPayments.paidAt, to)))
      .orderBy(desc(schema.externalPayments.paidAt)),
    tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores),
  ]));
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const body = toCsv(
    ["Ödeme zamanı", "Kaynak", "Dış kimlik", "Yöntem", "Tutar", "Para birimi", "Şube", "Referans"],
    rows.map((r) => {
      const currency = isCurrency(r.currency) ? r.currency : "TRY";
      return [dt(r.paidAt), r.source, r.externalId, METHOD[r.method] ?? r.method,
        formatMoney(r.amount, currency), currency,
        r.storeId ? storeNames.get(r.storeId) ?? "" : "", r.reference ?? ""];
    }),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cabukpos-dis-odemeler-${label}.csv"`,
      "cache-control": "no-store",
    },
  });
}
