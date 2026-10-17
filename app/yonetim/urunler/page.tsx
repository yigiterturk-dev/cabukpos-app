import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCategory, setProductActive } from "@/lib/admin/catalog-actions";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { moneyFormatter } from "@/lib/admin/currency";
import { stockUnitOf } from "@/lib/core/stock";
import { categoryStationForStore, loadStoreStationRoutes, productStationForStore } from "@/lib/core/station-routing";
import { CategoryForm, ProductForm } from "@/components/admin/ProductForm";
import { ProductImportForm } from "@/components/admin/ProductImportForm";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Plus } from "lucide-react";
import { Badge, buttonClass, Card, Empty, Input, PageHeader, Panel, SplitView, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Urunler({ searchParams }: { searchParams: Promise<{ duzenle?: string; tur?: string; q?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const { duzenle, tur, q = "" } = await searchParams;
  const raw = tur === "hammadde";
  const restoran = a.vertical === "restoran";
  const storeId = restoran ? await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId)) : null;
  const [cats, prods, stations, groups, links] = await withTenant(a.tenantId, (tx) =>
    Promise.all([
      tx.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
      tx.select().from(schema.products).orderBy(asc(schema.products.name)),
      restoran ? tx.select({ value: schema.stations.id, label: schema.stations.name }).from(schema.stations).where(storeId ? eq(schema.stations.storeId, storeId) : sql`false`).orderBy(asc(schema.stations.sort)) : [],
      restoran ? tx.select({ value: schema.optionGroups.id, label: schema.optionGroups.name }).from(schema.optionGroups).orderBy(asc(schema.optionGroups.sort), asc(schema.optionGroups.name)) : [],
      restoran ? tx.select().from(schema.productOptionGroups).orderBy(asc(schema.productOptionGroups.sort)) : [],
    ]),
  );
  const routes = restoran && storeId
    ? await withTenant(a.tenantId, (tx) => loadStoreStationRoutes(tx, storeId))
    : { stationIds: new Set<string>(), categories: new Map<string, string | null>(), products: new Map<string, string | null>() };
  const categoryStations = new Map(cats.map((c) => [c.id, categoryStationForStore(c.id, c.stationId, routes)]));
  const salon = restoran ? { stations, groups, storeId } : undefined;
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const editing = prods.find((p) => p.id === duzenle);
  const needle = q.trim().toLocaleLowerCase("tr");
  const shown = prods.filter((p) => p.sellable !== raw && (!needle || p.name.toLocaleLowerCase("tr").includes(needle) || p.barcodes.some((barcode) => barcode.includes(q.trim()))));
  const options = cats.map((c) => ({ value: c.id, label: c.name }));
  const encodedQuery = q.trim() ? encodeURIComponent(q.trim()) : "";
  const querySuffix = encodedQuery ? `&q=${encodedQuery}` : "";
  const soldTabHref = encodedQuery ? `/yonetim/urunler?q=${encodedQuery}` : "/yonetim/urunler";
  const productInitial = editing && { stationId: productStationForStore(editing.id, editing.stationId, editing.categoryId ? categoryStations.get(editing.categoryId) ?? null : null, routes), optionGroupIds: links.filter((l) => l.productId === editing.id).map((l) => l.groupId), id: editing.id, name: editing.name, price: editing.price, vatRate: editing.vatRate, categoryId: editing.categoryId, barcodes: editing.barcodes, kind: editing.kind, plu: editing.plu, trackStock: editing.trackStock, quick: editing.quick, sellable: editing.sellable, unit: editing.unit, cost: editing.cost, minStock: editing.minStock, yieldMilli: editing.yieldMilli };
  return (
    <>
      <PageHeader title="Ürünler" desc="Fiyatlar KDV dahil. Kasada satıştaki ürünler görünür." actions={editing && <Link href="/yonetim/urunler" className={buttonClass("secondary")}><Plus aria-hidden className="size-4" />Yeni ürün</Link>} />
      <SplitView wide panel={
        <div className="space-y-4">
          <ProductImportForm />
          <Panel title={editing ? `Düzenle: ${editing.name}` : "Ürün ekle"} tone={editing ? "edit" : undefined}>
            <ProductForm key={editing?.id ?? "yeni"} categories={options} salon={salon} initial={productInitial} />
          </Panel>
          <Panel title="Kategoriler" desc="Kasadaki sekmeler. Ürünü olan kategori silinince ürünler kategorisiz kalır.">
            {cats.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {cats.map((c) => (
                  <div key={c.id} className="flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm">
                    <span className="block max-w-[14rem] break-words">{c.name}</span>
                    <ConfirmActionForm action={deleteCategory.bind(null, c.id)} ariaLabel={`${c.name} kategorisini sil`} label="×" prompt={`“${c.name}” kategorisi silinecek; ürünler kategorisiz kalacak. Devam etmek istiyor musunuz?`} className="grid size-11 -my-1 -mr-2 place-items-center rounded-full text-muted outline-none hover:bg-bad-soft hover:text-bad focus-visible:ring-4 focus-visible:ring-bad/20" />
                  </div>
                ))}
              </div>
            )}
            <CategoryForm />
          </Panel>
        </div>
      } list={<>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form className="flex min-w-48 flex-1 items-end gap-2 sm:max-w-sm" role="search">
          <div className="min-w-0 flex-1"><Input name="q" defaultValue={q} placeholder="Ürün veya barkod ara" aria-label="Ürün veya barkod ara" />{tur && <input type="hidden" name="tur" value={tur} />}</div>
          <button type="submit" className={buttonClass("secondary")}>Ara</button>
        </form>
        <span className="text-xs text-muted">{shown.length} ürün</span>
        <nav className="flex gap-1" aria-label="Ürün türü">
          {([["", "Satılan"], ["hammadde", "Hammadde / ara ürün"]] as const).map(([v, l]) => (
            <Link key={v} aria-current={(tur ?? "") === v ? "page" : undefined} href={v ? `/yonetim/urunler?tur=${v}${querySuffix}` : soldTabHref} className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${(tur ?? "") === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>{l}</Link>
          ))}
        </nav>
      </div>
      {shown.length === 0 ? (
        <Empty>{q.trim() ? `“${q.trim()}” ile eşleşen ürün yok.` : raw ? "Hammadde yok. Formda “Kasada satılır: Hayır” seçin." : "Henüz ürün yok."}</Empty>
      ) : (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Ürün kataloğu" className="divide-y divide-line">
            {shown.map((p) => (
              <li key={p.id} className={`space-y-3 p-4 ${p.id === duzenle ? "bg-brand-soft/45" : ""} ${p.active ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{p.name}</p>
                    {!p.sellable && <p className="mt-0.5 text-xs text-muted">{p.unit}{p.yieldMilli ? " · ara ürün" : ""}</p>}
                    {p.kind === "tartili" && <p className="text-xs text-muted">Kg{p.plu ? ` · PLU ${p.plu}` : ""}</p>}
                    {p.quick && <p className="text-xs text-brand">Kasada hızlı tuş</p>}
                  </div>
                  {p.active ? <Badge tone="ok">{p.sellable ? "Satışta" : "Aktif"}</Badge> : <Badge>Kapalı</Badge>}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted">Kategori</dt><dd className="break-words">{p.categoryId ? catName.get(p.categoryId) ?? "—" : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Fiyat</dt><dd className="tabular">{p.sellable ? <>{money(p.price)}{p.kind === "tartili" && "/kg"}</> : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Maliyet</dt><dd className="tabular">{p.cost == null ? "—" : `${money(p.cost)}/${stockUnitOf(p)}`}</dd></div>
                  <div><dt className="text-xs text-muted">KDV · Barkod</dt><dd>%{p.vatRate} · {p.barcodes.length || "—"}</dd></div>
                </dl>
                <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2">
                  <Link href={`/yonetim/urunler?duzenle=${p.id}${tur ? `&tur=${tur}` : ""}${querySuffix}`} aria-label={`Düzenle: ${p.name}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Düzenle</Link>
                  <form action={setProductActive.bind(null, p.id, !p.active)}><button aria-label={`${p.active ? "Satıştan kaldır" : "Satışa aç"}: ${p.name}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-muted outline-none hover:bg-surface-3 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{p.active ? "Satıştan kaldır" : "Satışa aç"}</button></form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Ürün kataloğu, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Ürün kataloğu" className="w-full min-w-[680px] text-sm 2xl:min-w-[900px]">
            <thead className={TABLE_HEAD}>
              <tr><th scope="col" className="px-4 py-2.5 font-medium">Ürün</th><th scope="col" className="px-4 py-2.5 font-medium">Kategori</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Fiyat</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Maliyet</th><th scope="col" className="hidden px-4 py-2.5 font-medium 2xl:table-cell">KDV</th><th scope="col" className="hidden px-4 py-2.5 font-medium 2xl:table-cell">Barkod</th><th scope="col" className="px-4 py-2.5 font-medium">Durum</th><th scope="col" className="sticky right-0 z-20 bg-surface-2 px-4 py-2.5 text-right font-medium shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.45)]">Aksiyonlar</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((p) => (
                <tr key={p.id} className={`transition-colors hover:bg-surface-2 ${p.id === duzenle ? "bg-brand-soft/45" : ""} ${p.active ? "" : "opacity-60"}`}>
                  <td className="max-w-[22rem] px-4 py-2.5 font-medium"><span className="block truncate" title={p.name}>{p.name}{!p.sellable && <span className="ml-2 text-xs text-muted">{p.unit}{p.yieldMilli ? " · ara ürün" : ""}</span>}{p.kind === "tartili" && <span className="ml-2 text-xs text-muted">kg{p.plu ? ` · PLU ${p.plu}` : ""}</span>}{p.quick && <span className="ml-2 text-xs text-brand">hızlı tuş</span>}</span></td>
                  <td className="max-w-[14rem] px-4 py-2.5 text-muted"><span className="block truncate" title={p.categoryId ? catName.get(p.categoryId) ?? "" : "—"}>{p.categoryId ? catName.get(p.categoryId) : "—"}</span></td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-right">{p.sellable ? <>{money(p.price)}{p.kind === "tartili" && "/kg"}</> : "—"}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-right text-muted">{p.cost == null ? "—" : `${money(p.cost)}/${stockUnitOf(p)}`}</td>
                  <td className="hidden px-4 py-2.5 2xl:table-cell">%{p.vatRate}</td>
                  <td className="hidden px-4 py-2.5 text-muted 2xl:table-cell">{p.barcodes.length || "—"}</td>
                  <td className="px-4 py-2.5">{p.active ? <Badge tone="ok">{p.sellable ? "Satışta" : "Aktif"}</Badge> : <Badge>Kapalı</Badge>}</td>
                  <td className={`sticky right-0 whitespace-nowrap px-4 py-2.5 text-right shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.35)] ${p.id === duzenle ? "bg-brand-soft/90" : "bg-surface"}`}>
                    <Link href={`/yonetim/urunler?duzenle=${p.id}${tur ? `&tur=${tur}` : ""}${querySuffix}`} aria-label={`Düzenle: ${p.name}`} className="mr-1 inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Düzenle</Link>
                    <form action={setProductActive.bind(null, p.id, !p.active)} className="inline">
                      <button aria-label={`${p.active ? "Satıştan kaldır" : "Satışa aç"}: ${p.name}`} className="inline-flex min-h-11 items-center rounded-lg px-2 text-muted outline-none hover:bg-surface-3 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{p.active ? "Satıştan kaldır" : "Satışa aç"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
      </>} />
    </>
  );
}
