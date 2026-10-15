import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { recentProductions } from "@/lib/admin/recipe";
import { formatQty } from "@/lib/core/stock";
import { ProductionForm } from "@/components/admin/RecipeForms";
import { Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Uretim() {
  const a = await requireAdmin();
  if (a.vertical !== "restoran") notFound();
  const P = schema.products;
  const [prods, recent] = await Promise.all([
    withTenant(a.tenantId, (tx) => tx.selectDistinct({ id: P.id, name: P.name, unit: P.unit, yieldMilli: P.yieldMilli }).from(P).innerJoin(schema.recipeItems, eq(schema.recipeItems.productId, P.id)).where(and(eq(P.sellable, false), isNotNull(P.yieldMilli), eq(P.active, true))).orderBy(asc(P.name))),
    recentProductions(a.tenantId),
  ]);
  return (
    <>
      <PageHeader title="Üretim" desc="Ara ürün (harç, sos, hamur) üretince hammaddeler düşer, ara ürün stoğa girer; maliyeti hammaddelerden hesaplanır." />
      <Card className="mb-6 p-5">
        {prods.length ? <ProductionForm products={prods.map((p) => ({ value: p.id, label: p.name, yieldLabel: formatQty(p.yieldMilli!, p.unit) + (p.unit === "adet" ? " adet" : "") }))} /> : <Empty>Reçeteli ara ürün yok. Önce Ürünler’de ara ürün, sonra Reçeteler’de reçetesini girin.</Empty>}
      </Card>
      {recent.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className={TABLE_HEAD}><tr><th className="p-3 font-medium">Tarih</th><th className="p-3 font-medium">Ara ürün</th><th className="p-3 text-right font-medium">Parti</th><th className="p-3 text-right font-medium">Miktar</th><th className="p-3 font-medium">Not</th></tr></thead>
            <tbody className="divide-y divide-line">
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 text-muted">{dt.format(r.at)}</td>
                  <td className="max-w-[20rem] p-3 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td>
                  <td className="tabular p-3 text-right">{(r.batchesMilli / 1000).toLocaleString("tr-TR")}</td>
                  <td className="tabular p-3 text-right">{r.yieldMilli ? formatQty(Math.round((r.batchesMilli * r.yieldMilli) / 1000), r.unit) : "—"}</td>
                  <td className="p-3 text-muted">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
