import { asc, desc, eq, inArray } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { cancelPurchase } from "@/lib/admin/purchase-actions";
import { formatTL } from "@/lib/core/money";
import { formatQty, stockUnitOf } from "@/lib/core/stock";
import { PurchaseForm } from "@/components/admin/PurchaseForms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const day = (d: string) => d.split("-").reverse().join(".");

export default async function Alislar() {
  const a = await requireAdmin();
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
        {prods.length ? <PurchaseForm products={prods.map((p) => ({ value: p.id, label: p.name, unit: stockUnitOf(p) }))} suppliers={sups} today={today()} /> : <Empty>Stok takipli ürün yok. Ürünler’de stok takibini açın ya da hammadde ekleyin.</Empty>}
      </Card>
      {list.length === 0 ? <Empty>Henüz alış yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr><th className="p-3 font-medium">Tarih</th><th className="p-3 font-medium">Tedarikçi</th><th className="p-3 font-medium">Belge</th><th className="p-3 font-medium">Kalemler</th><th className="p-3 text-right font-medium">Tutar</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((x) => (
                <tr key={x.id} className={x.status === "iptal" ? "opacity-60" : ""} data-testid="purchase">
                  <td className="tabular p-3">{day(x.date)}</td>
                  <td className="p-3">{x.supplier ?? "—"}</td>
                  <td className="p-3 text-muted">{x.docNo ?? ""}</td>
                  <td className="p-3 text-muted">{lines.filter((l) => l.purchaseId === x.id).map((l) => `${l.name} ${formatQty(l.qtyMilli, stockUnitOf(l))}`).join(", ")}</td>
                  <td className="tabular p-3 text-right">{formatTL(x.total)}</td>
                  <td className="p-3 text-right">{x.status === "iptal" ? <Badge>İptal</Badge> : <form action={cancelPurchase.bind(null, x.id)}><button className="text-muted hover:text-ink hover:underline">İptal et</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
