import Link from "next/link";
import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCategory, setProductActive } from "@/lib/admin/catalog-actions";
import { formatTL } from "@/lib/core/money";
import { stockUnitOf } from "@/lib/core/stock";
import { CategoryForm, ProductForm } from "@/components/admin/ProductForm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Urunler({ searchParams }: { searchParams: Promise<{ duzenle?: string; tur?: string }> }) {
  const a = await requireAdmin();
  const { duzenle, tur } = await searchParams;
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
  const shown = prods.filter((p) => p.sellable !== raw);
  const options = cats.map((c) => ({ value: c.id, label: c.name }));
  return (
    <>
      <PageHeader title="Ürünler" desc="Fiyatlar KDV dahil. Kasada satıştaki ürünler görünür." />
      <Card className="mb-6 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {cats.map((c) => (
            <form key={c.id} action={deleteCategory.bind(null, c.id)} className="flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-sm">
              <span>{c.name}</span>
              <button aria-label={`${c.name} kategorisini sil`} className="rounded-full px-2 text-muted hover:bg-stone-100">×</button>
            </form>
          ))}
        </div>
        <CategoryForm />
      </Card>
      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-semibold">{editing ? `Düzenle: ${editing.name}` : "Ürün ekle"}</h2>
        <ProductForm key={editing?.id ?? "yeni"} categories={options} salon={salon} initial={editing && { stationId: editing.stationId, optionGroupIds: links.filter((l) => l.productId === editing.id).map((l) => l.groupId), id: editing.id, name: editing.name, price: editing.price, vatRate: editing.vatRate, categoryId: editing.categoryId, barcodes: editing.barcodes, kind: editing.kind, plu: editing.plu, trackStock: editing.trackStock, quick: editing.quick, sellable: editing.sellable, unit: editing.unit, cost: editing.cost, minStock: editing.minStock, yieldMilli: editing.yieldMilli }} />
      </Card>
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Ürün listesi">
        {([["", "Satılan"], ["hammadde", "Hammadde / ara ürün"]] as const).map(([v, l]) => (
          <Link key={v} role="tab" aria-selected={(tur ?? "") === v} href={v ? `/yonetim/urunler?tur=${v}` : "/yonetim/urunler"} className={`rounded-lg border px-3 py-1.5 text-sm ${(tur ?? "") === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{l}</Link>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty>{raw ? "Hammadde yok. Formda “Kasada satılır: Hayır” seçin." : "Henüz ürün yok."}</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr><th className="p-3 font-medium">Ürün</th><th className="p-3 font-medium">Kategori</th><th className="p-3 text-right font-medium">Fiyat</th><th className="p-3 text-right font-medium">Maliyet</th><th className="p-3 font-medium">KDV</th><th className="p-3 font-medium">Barkod</th><th className="p-3 font-medium">Durum</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                  <td className="p-3 font-medium">{p.name}{!p.sellable && <span className="ml-2 text-xs text-muted">{p.unit}{p.yieldMilli ? " · ara ürün" : ""}</span>}{p.kind === "tartili" && <span className="ml-2 text-xs text-muted">kg{p.plu ? ` · PLU ${p.plu}` : ""}</span>}{p.quick && <span className="ml-2 text-xs text-brand">hızlı tuş</span>}</td>
                  <td className="p-3 text-muted">{p.categoryId ? catName.get(p.categoryId) : "—"}</td>
                  <td className="tabular p-3 text-right">{p.sellable ? <>{formatTL(p.price)}{p.kind === "tartili" && "/kg"}</> : "—"}</td>
                  <td className="tabular p-3 text-right text-muted">{p.cost == null ? "—" : `${formatTL(p.cost)}/${stockUnitOf(p)}`}</td>
                  <td className="p-3">%{p.vatRate}</td>
                  <td className="p-3 text-muted">{p.barcodes.length || "—"}</td>
                  <td className="p-3">{p.active ? <Badge tone="ok">{p.sellable ? "Satışta" : "Aktif"}</Badge> : <Badge>Kapalı</Badge>}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <Link href={`/yonetim/urunler?duzenle=${p.id}`} className="mr-3 text-brand underline">Düzenle</Link>
                    <form action={setProductActive.bind(null, p.id, !p.active)} className="inline">
                      <button className="text-muted underline">{p.active ? "Satıştan kaldır" : "Satışa aç"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
