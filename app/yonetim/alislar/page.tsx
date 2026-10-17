import Link from "next/link";
import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { cancelPurchase } from "@/lib/admin/purchase-actions";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";
import { formatQty, stockUnitOf } from "@/lib/core/stock";
import { PurchaseForm } from "@/components/admin/PurchaseForms";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Badge, buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const day = (d: string) => d.split("-").reverse().join(".");
const PAGE_SIZE = 50;

export default async function Alislar({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const a = await requireAdmin();
  const { page } = await searchParams;
  const requestedPage = Number(page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const money = await moneyFormatter(a.tenantId);
  const P = schema.products, Pu = schema.purchases, PL = schema.purchaseLines;
  const { prods, sups, list, lines, storeId, total } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    const purchaseWhere = storeId ? eq(Pu.storeId, storeId) : sql`false`;
    const [{ total }] = await tx.select({ total: count() }).from(Pu).where(purchaseWhere);
    const safePage = Math.min(pageNo, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const [prods, sups, list] = await Promise.all([
      tx.select().from(P).where(eq(P.trackStock, true)).orderBy(asc(P.name)),
      tx.select({ value: schema.suppliers.id, label: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
      tx.select({ id: Pu.id, date: Pu.date, docNo: Pu.docNo, total: Pu.total, status: Pu.status, supplier: schema.suppliers.name }).from(Pu).leftJoin(schema.suppliers, eq(schema.suppliers.id, Pu.supplierId)).where(purchaseWhere).orderBy(desc(Pu.date), desc(Pu.createdAt)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE),
    ]);
    const lines = list.length ? await tx.select({ purchaseId: PL.purchaseId, qtyMilli: PL.qtyMilli, name: P.name, sellable: P.sellable, kind: P.kind, unit: P.unit }).from(PL).innerJoin(P, eq(P.id, PL.productId)).where(inArray(PL.purchaseId, list.map((x) => x.id))) : [];
    return { prods, sups, list, lines, storeId, total };
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(pageNo, pageCount);
  const firstItem = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, total);
  const purchaseContent = !prods.length
    ? <Empty>Stok takipli ürün yok. Ürünler’de stok takibini açın ya da hammadde ekleyin.</Empty>
    : !storeId
      ? <p className="text-sm text-muted" role="status">Alış kaydı için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline underline-offset-2">bir şube oluşturun</Link>.</p>
      : <PurchaseForm products={prods.map((p) => ({ value: p.id, label: p.name, unit: stockUnitOf(p) }))} suppliers={sups} today={today()} currency={await tenantCurrency(a.tenantId)} />;
  const linesByPurchase = new Map<string, string>();
  for (const line of lines) {
    const current = linesByPurchase.get(line.purchaseId);
    const item = `${line.name} ${formatQty(line.qtyMilli, stockUnitOf(line))}`;
    linesByPurchase.set(line.purchaseId, current ? `${current}, ${item}` : item);
  }
  return (
    <>
      <PageHeader title="Alışlar" desc="Alış fişi stoğu artırır ve ürünün maliyetini son alış fiyatına çeker. Tutarlar KDV dahil." />
      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-semibold">Yeni alış</h2>
        {purchaseContent}
      </Card>
      {list.length === 0 ? <Empty>{storeId ? "Bu şubede henüz alış yok." : <>Alış geçmişini görüntülemek için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</>}</Empty> : (
        <>
        <p className="mb-3 text-sm text-muted">{firstItem}–{lastItem} / {total} alış kaydı</p>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Alış kayıtları" className="divide-y divide-line">
            {list.map((x) => (
              <li key={x.id} className={`space-y-3 p-4 ${x.status === "iptal" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{x.supplier ?? "Tedarikçisiz alış"}</p><p className="mt-0.5 text-sm text-muted">{day(x.date)}{x.docNo ? ` · Belge ${x.docNo}` : ""}</p></div><p className="shrink-0 tabular font-semibold">{money(x.total)}</p></div>
                <p className="break-words text-sm text-muted">{linesByPurchase.get(x.id) ?? "Kalem bilgisi yok"}</p>
                <div className="border-t border-line pt-2 text-right">{x.status === "iptal" ? <Badge>İptal</Badge> : <ConfirmActionForm action={cancelPurchase.bind(null, x.id)} ariaLabel={`Alış kaydını iptal et: ${x.supplier ?? "Tedarikçi belirtilmemiş"}, ${day(x.date)}`} label="İptal et" prompt="Bu alış kaydı iptal edilecek ve stok hareketi geri alınacak. Devam etmek istiyor musunuz?" className={buttonClass("danger", "sm")} />}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Alış kayıtları, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Alış kayıtları" className="w-full min-w-[760px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="p-3 font-medium">Tarih</th><th scope="col" className="p-3 font-medium">Tedarikçi</th><th scope="col" className="p-3 font-medium">Belge</th><th scope="col" className="p-3 font-medium">Kalemler</th><th scope="col" className="p-3 text-right font-medium">Tutar</th><th scope="col" className="sticky right-0 z-20 bg-surface-2 p-3 text-right font-medium shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.45)]">Aksiyonlar</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((x) => (
                <tr key={x.id} className={x.status === "iptal" ? "opacity-60" : ""} data-testid="purchase">
                  <td className="tabular p-3">{day(x.date)}</td>
                  <td className="max-w-[12rem] p-3"><span className="block truncate" title={x.supplier ?? "—"}>{x.supplier ?? "—"}</span></td>
                  <td className="p-3 text-muted">{x.docNo ?? ""}</td>
                  <td className="w-[24rem] max-w-[24rem] p-3 text-muted"><span className="block truncate" title={linesByPurchase.get(x.id) ?? ""}>{linesByPurchase.get(x.id) ?? ""}</span></td>
                  <td className="tabular p-3 text-right">{money(x.total)}</td>
                  <td className={`sticky right-0 p-3 text-right shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.35)] ${x.status === "iptal" ? "bg-surface/90" : "bg-surface"}`}>{x.status === "iptal" ? <Badge>İptal</Badge> : <ConfirmActionForm action={cancelPurchase.bind(null, x.id)} ariaLabel={`Alış kaydını iptal et: ${x.supplier ?? "Tedarikçi belirtilmemiş"}, ${day(x.date)}`} label="İptal et" prompt="Bu alış kaydı iptal edilecek ve stok hareketi geri alınacak. Devam etmek istiyor musunuz?" className={buttonClass("danger", "sm")} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        {pageCount > 1 && <nav aria-label="Alış kayıtları sayfaları" className="mt-4 flex items-center justify-between gap-3">
          {currentPage > 1 ? <Link href={`/yonetim/alislar?page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
          <span className="text-sm text-muted">Sayfa {currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={`/yonetim/alislar?page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
        </nav>}
        </>
      )}
    </>
  );
}
