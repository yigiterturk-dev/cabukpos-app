import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { recentProductions } from "@/lib/admin/recipe";
import { formatQty } from "@/lib/core/stock";
import { ProductionForm } from "@/components/admin/RecipeForms";
import { Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import Link from "next/link";

export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Uretim() {
  const a = await requireAdmin();
  if (a.vertical !== "restoran") notFound();
  const P = schema.products;
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  const [prods, recent] = await Promise.all([
    withTenant(a.tenantId, (tx) => tx.selectDistinct({ id: P.id, name: P.name, unit: P.unit, yieldMilli: P.yieldMilli }).from(P).innerJoin(schema.recipeItems, eq(schema.recipeItems.productId, P.id)).where(and(eq(P.sellable, false), isNotNull(P.yieldMilli), eq(P.active, true))).orderBy(asc(P.name))),
    recentProductions(a.tenantId, storeId),
  ]);
  return (
    <>
      <PageHeader title="Üretim" desc="Ara ürün (harç, sos, hamur) üretince hammaddeler düşer, ara ürün stoğa girer; maliyeti hammaddelerden hesaplanır." />
      <Card className="mb-6 p-5">
        {!storeId ? <Empty>Üretim yapmak için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</Empty> : prods.length ? <ProductionForm products={prods.map((p) => ({ value: p.id, label: p.name, yieldLabel: formatQty(p.yieldMilli!, p.unit) + (p.unit === "adet" ? " adet" : "") }))} /> : <Empty>Reçeteli ara ürün yok. Önce Ürünler’de ara ürün, sonra Reçeteler’de reçetesini girin.</Empty>}
      </Card>
      {recent.length > 0 && (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Son üretim kayıtları" className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-medium">{r.name}</p><time dateTime={r.at.toISOString()} className="shrink-0 text-xs text-muted">{dt.format(r.at)}</time></div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted">Parti</dt><dd className="tabular">{(r.batchesMilli / 1000).toLocaleString("tr-TR")}</dd></div>
                  <div><dt className="text-xs text-muted">Üretilen miktar</dt><dd className="tabular">{r.yieldMilli ? formatQty(Math.round((r.batchesMilli * r.yieldMilli) / 1000), r.unit) : "—"}</dd></div>
                  {r.note && <div className="col-span-2"><dt className="text-xs text-muted">Not</dt><dd className="break-words">{r.note}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Son üretim kayıtları, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Son üretim kayıtları" className="w-full min-w-[680px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="p-3 font-medium">Tarih</th><th scope="col" className="p-3 font-medium">Ara ürün</th><th scope="col" className="p-3 text-right font-medium">Parti</th><th scope="col" className="p-3 text-right font-medium">Miktar</th><th scope="col" className="p-3 font-medium">Not</th></tr></thead>
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
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
    </>
  );
}
