import Link from "next/link";
import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCategory, setProductActive } from "@/lib/admin/catalog-actions";
import { formatTL } from "@/lib/core/money";
import { CategoryForm, ProductForm } from "@/components/admin/ProductForm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Urunler({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  const a = await requireAdmin();
  const { duzenle } = await searchParams;
  const [cats, prods] = await withTenant(a.tenantId, (tx) =>
    Promise.all([
      tx.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
      tx.select().from(schema.products).orderBy(asc(schema.products.name)),
    ]),
  );
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const editing = prods.find((p) => p.id === duzenle);
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
        <ProductForm key={editing?.id ?? "yeni"} categories={options} initial={editing && { id: editing.id, name: editing.name, price: editing.price, vatRate: editing.vatRate, categoryId: editing.categoryId, barcodes: editing.barcodes, kind: editing.kind, plu: editing.plu, trackStock: editing.trackStock, quick: editing.quick }} />
      </Card>
      {prods.length === 0 ? (
        <Empty>Henüz ürün yok.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr><th className="p-3 font-medium">Ürün</th><th className="p-3 font-medium">Kategori</th><th className="p-3 text-right font-medium">Fiyat</th><th className="p-3 font-medium">KDV</th><th className="p-3 font-medium">Barkod</th><th className="p-3 font-medium">Durum</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {prods.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                  <td className="p-3 font-medium">{p.name}{p.kind === "tartili" && <span className="ml-2 text-xs text-muted">kg{p.plu ? ` · PLU ${p.plu}` : ""}</span>}{p.quick && <span className="ml-2 text-xs text-brand">hızlı tuş</span>}</td>
                  <td className="p-3 text-muted">{p.categoryId ? catName.get(p.categoryId) : "—"}</td>
                  <td className="tabular p-3 text-right">{formatTL(p.price)}{p.kind === "tartili" && "/kg"}</td>
                  <td className="p-3">%{p.vatRate}</td>
                  <td className="p-3 text-muted">{p.barcodes.length || "—"}</td>
                  <td className="p-3">{p.active ? <Badge tone="ok">Satışta</Badge> : <Badge>Kapalı</Badge>}</td>
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
