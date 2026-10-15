import { asc, desc, eq, inArray } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { cancelPurchase } from "@/lib/admin/purchase-actions";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";
import { formatQty, stockUnitOf } from "@/lib/core/stock";
import { PurchaseForm } from "@/components/admin/PurchaseForms";
import { Badge, buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const day = (d: string) => d.split("-").reverse().join(".");

export default async function Alislar() {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const P = schema.products, Pu = schema.purchases, PL = schema.purchaseLines;
  const { prods, sups, list, lines } = await withTenant(a.tenantId, async (tx) => {
    const [prods, sups, list] = await Promise.all([
      tx.select().from(P).where(eq(P.trackStock, true)).orderBy(asc(P.name)),
      tx.select({ value: schema.suppliers.id, label: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
      tx.select({ id: Pu.id, date: Pu.date, docNo: Pu.docNo, total: Pu.total, status: Pu.status, supplier: schema.suppliers.name }).from(Pu).leftJoin(schema.suppliers, eq(schema.suppliers.id, Pu.supplierId)).orderBy(desc(Pu.date), desc(Pu.createdAt)).limit(100),
    ]);
    const lines = list.length ? await tx.select({ purchaseId: PL.purchaseId, qtyMilli: PL.qtyMilli, name: P.name, sellable: P.sellable, kind: P.kind, unit: P.unit }).from(PL).innerJoin(P, eq(P.id, PL.productId)).where(inArray(PL.purchaseId, list.map((x) => x.id))) : [];
    return { prods, sups, list, lines };
  });
  return (
    <>
      <PageHeader title="Alışlar" desc="Alış fişi stoğu artırır ve ürünün maliyetini son alış fiyatına çeker. Tutarlar KDV dahil." />
      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-semibold">Yeni alış</h2>
        {prods.length ? <PurchaseForm products={prods.map((p) => ({ value: p.id, label: p.name, unit: stockUnitOf(p) }))} suppliers={sups} today={today()} currency={await tenantCurrency(a.tenantId)} /> : <Empty>Stok takipli ürün yok. Ürünler’de stok takibini açın ya da hammadde ekleyin.</Empty>}
      </Card>
      {list.length === 0 ? <Empty>Henüz alış yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className={TABLE_HEAD}><tr><th className="p-3 font-medium">Tarih</th><th className="p-3 font-medium">Tedarikçi</th><th className="p-3 font-medium">Belge</th><th className="p-3 font-medium">Kalemler</th><th className="p-3 text-right font-medium">Tutar</th><th className="sticky right-0 z-20 bg-surface-2 p-3 text-right font-medium shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.45)]">Aksiyonlar</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((x) => (
                <tr key={x.id} className={x.status === "iptal" ? "opacity-60" : ""} data-testid="purchase">
                  <td className="tabular p-3">{day(x.date)}</td>
                  <td className="max-w-[12rem] p-3"><span className="block truncate" title={x.supplier ?? "—"}>{x.supplier ?? "—"}</span></td>
                  <td className="p-3 text-muted">{x.docNo ?? ""}</td>
                  <td className="w-[24rem] max-w-[24rem] p-3 text-muted"><span className="block truncate" title={lines.filter((l) => l.purchaseId === x.id).map((l) => `${l.name} ${formatQty(l.qtyMilli, stockUnitOf(l))}`).join(", ")}>{lines.filter((l) => l.purchaseId === x.id).map((l) => `${l.name} ${formatQty(l.qtyMilli, stockUnitOf(l))}`).join(", ")}</span></td>
                  <td className="tabular p-3 text-right">{money(x.total)}</td>
                  <td className={`sticky right-0 p-3 text-right shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.35)] ${x.status === "iptal" ? "bg-surface/90" : "bg-surface"}`}>{x.status === "iptal" ? <Badge>İptal</Badge> : <form action={cancelPurchase.bind(null, x.id)}><button className={buttonClass("danger", "sm")}>İptal et</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
