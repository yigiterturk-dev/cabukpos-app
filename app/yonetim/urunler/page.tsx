import Link from "next/link";
import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCategory, setProductActive } from "@/lib/admin/catalog-actions";
import { formatTL } from "@/lib/core/money";
import { stockUnitOf } from "@/lib/core/stock";
import { CategoryForm, ProductForm } from "@/components/admin/ProductForm";
import { Plus, X } from "lucide-react";
import { Badge, buttonClass, Card, Empty, Input, PageHeader, Panel, SplitView, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Urunler({ searchParams }: { searchParams: Promise<{ duzenle?: string; tur?: string; q?: string }> }) {
  const a = await requireAdmin();
  const { duzenle, tur, q = "" } = await searchParams;
  const raw = tur === "hammadde";
  const restoran = a.vertical === "restoran";
  const [cats, prods, stations, groups, links] = await withTenant(a.tenantId, (tx) =>
    Promise.all([
      tx.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
      tx.select().from(schema.products).orderBy(asc(schema.products.name)),
      restoran ? tx.select({ value: schema.stations.id, label: schema.stations.name }).from(schema.stations).orderBy(asc(schema.stations.sort)) : [],
      restoran ? tx.select({ value: schema.optionGroups.id, label: schema.optionGroups.name }).from(schema.optionGroups).orderBy(asc(schema.optionGroups.sort), asc(schema.optionGroups.name)) : [],
      restoran ? tx.select().from(schema.productOptionGroups).orderBy(asc(schema.productOptionGroups.sort)) : [],
    ]),
  );
  const salon = restoran ? { stations, groups } : undefined;
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const editing = prods.find((p) => p.id === duzenle);
  const needle = q.trim().toLocaleLowerCase("tr");
  const shown = prods.filter((p) => p.sellable !== raw && (!needle || p.name.toLocaleLowerCase("tr").includes(needle) || p.barcodes.some((barcode) => barcode.includes(q.trim()))));
  const options = cats.map((c) => ({ value: c.id, label: c.name }));
  const encodedQuery = q.trim() ? encodeURIComponent(q.trim()) : "";
  const querySuffix = encodedQuery ? `&q=${encodedQuery}` : "";
  const soldTabHref = encodedQuery ? `/yonetim/urunler?q=${encodedQuery}` : "/yonetim/urunler";
  const productInitial = editing && { stationId: editing.stationId, optionGroupIds: links.filter((l) => l.productId === editing.id).map((l) => l.groupId), id: editing.id, name: editing.name, price: editing.price, vatRate: editing.vatRate, categoryId: editing.categoryId, barcodes: editing.barcodes, kind: editing.kind, plu: editing.plu, trackStock: editing.trackStock, quick: editing.quick, sellable: editing.sellable, unit: editing.unit, cost: editing.cost, minStock: editing.minStock, yieldMilli: editing.yieldMilli };
  return (
    <>
      <PageHeader title="Ürünler" desc="Fiyatlar KDV dahil. Kasada satıştaki ürünler görünür." actions={editing && <Link href="/yonetim/urunler" className={buttonClass("secondary")}><Plus aria-hidden className="size-4" />Yeni ürün</Link>} />
      <SplitView wide panel={
        <div className="space-y-4">
          <Panel title={editing ? `Düzenle: ${editing.name}` : "Ürün ekle"} tone={editing ? "edit" : undefined}>
            <ProductForm key={editing?.id ?? "yeni"} categories={options} salon={salon} initial={productInitial} />
          </Panel>
          <Panel title="Kategoriler" desc="Kasadaki sekmeler. Ürünü olan kategori silinince ürünler kategorisiz kalır.">
            {cats.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {cats.map((c) => (
                  <form key={c.id} action={deleteCategory.bind(null, c.id)} className="flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm">
                    <span>{c.name}</span>
                    <button aria-label={`${c.name} kategorisini sil`} className="grid size-6 place-items-center rounded-full text-muted hover:bg-bad-soft hover:text-bad"><X aria-hidden className="size-3.5" /></button>
                  </form>
                ))}
              </div>
            )}
            <CategoryForm />
          </Panel>
        </div>
      } list={<>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form className="min-w-48 flex-1 sm:max-w-sm">
          <Input name="q" defaultValue={q} placeholder="Ürün veya barkod ara" aria-label="Ürün veya barkod ara" />
          {tur && <input type="hidden" name="tur" value={tur} />}
        </form>
        <span className="text-xs text-muted">{shown.length} ürün</span>
        <div className="flex gap-1" role="tablist" aria-label="Ürün listesi">
          {([["", "Satılan"], ["hammadde", "Hammadde / ara ürün"]] as const).map(([v, l]) => (
            <Link key={v} role="tab" aria-selected={(tur ?? "") === v} href={v ? `/yonetim/urunler?tur=${v}${querySuffix}` : soldTabHref} className={`rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${(tur ?? "") === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>{l}</Link>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty>{q.trim() ? `“${q.trim()}” ile eşleşen ürün yok.` : raw ? "Hammadde yok. Formda “Kasada satılır: Hayır” seçin." : "Henüz ürün yok."}</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD}>
              <tr><th className="px-4 py-2.5 font-medium">Ürün</th><th className="px-4 py-2.5 font-medium">Kategori</th><th className="px-4 py-2.5 text-right font-medium">Fiyat</th><th className="px-4 py-2.5 text-right font-medium">Maliyet</th><th className="hidden px-4 py-2.5 font-medium 2xl:table-cell">KDV</th><th className="hidden px-4 py-2.5 font-medium 2xl:table-cell">Barkod</th><th className="px-4 py-2.5 font-medium">Durum</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((p) => (
                <tr key={p.id} className={`transition-colors hover:bg-surface-2 ${p.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-2.5 font-medium">{p.name}{!p.sellable && <span className="ml-2 text-xs text-muted">{p.unit}{p.yieldMilli ? " · ara ürün" : ""}</span>}{p.kind === "tartili" && <span className="ml-2 text-xs text-muted">kg{p.plu ? ` · PLU ${p.plu}` : ""}</span>}{p.quick && <span className="ml-2 text-xs text-brand">hızlı tuş</span>}</td>
                  <td className="px-4 py-2.5 text-muted">{p.categoryId ? catName.get(p.categoryId) : "—"}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-right">{p.sellable ? <>{formatTL(p.price)}{p.kind === "tartili" && "/kg"}</> : "—"}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-right text-muted">{p.cost == null ? "—" : `${formatTL(p.cost)}/${stockUnitOf(p)}`}</td>
                  <td className="hidden px-4 py-2.5 2xl:table-cell">%{p.vatRate}</td>
                  <td className="hidden px-4 py-2.5 text-muted 2xl:table-cell">{p.barcodes.length || "—"}</td>
                  <td className="px-4 py-2.5">{p.active ? <Badge tone="ok">{p.sellable ? "Satışta" : "Aktif"}</Badge> : <Badge>Kapalı</Badge>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Link href={`/yonetim/urunler?duzenle=${p.id}${tur ? `&tur=${tur}` : ""}${querySuffix}`} className="mr-3 font-medium text-brand hover:underline">Düzenle</Link>
                    <form action={setProductActive.bind(null, p.id, !p.active)} className="inline">
                      <button className="text-muted hover:text-ink hover:underline">{p.active ? "Satıştan kaldır" : "Satışa aç"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      </>} />
    </>
  );
}
