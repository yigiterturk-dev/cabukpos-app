import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { toggleBrand } from "@/lib/admin/brand-actions";
import { BrandForm, ProductPicker } from "@/components/admin/BrandForms";
import { Badge, Card, Empty, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// Bulut mutfak: tek mutfak, çok marka. Her markanın kendi QR menüsü vardır; mutfak/istasyon/stok şubede kalır.
export default async function Markalar() {
  const a = await requireAdmin();
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  if (!storeId) return <Empty>Marka menüsü hazırlamak için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</Empty>;
  const B = schema.brands, BP = schema.brandProducts, P = schema.products, C = schema.categories;
  const [brands, products] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(B).orderBy(desc(B.active), asc(B.name)),
    tx.select({ id: P.id, name: P.name, category: C.name, active: P.active, sellable: P.sellable })
      .from(P).leftJoin(C, eq(C.id, P.categoryId))
      .where(eq(P.tenantId, a.tenantId)).orderBy(asc(C.sort), asc(P.sort), asc(P.name)),
  ]));
  const selections = brands.length ? await withTenant(a.tenantId, (tx) => tx.select({ brandId: BP.brandId, productId: BP.productId }).from(BP)) : [];
  const selByBrand = new Map<string, Set<string>>();
  for (const s of selections) {
    if (!selByBrand.has(s.brandId)) selByBrand.set(s.brandId, new Set());
    selByBrand.get(s.brandId)!.add(s.productId);
  }
  const sellable = products.filter((p) => p.sellable && p.active);
  return (
    <>
      <PageHeader
        title="Markalar (bulut mutfak)"
        desc="Tek mutfak, çok marka: her markanın kendi QR menüsü olur. Seçki boşsa marka menüsü tüm aktif ürünleri gösterir; mutfağa düşen siparişler aynı istasyonlardan akar."
      />
      <div className="mb-6"><Panel title="Marka ekle"><BrandForm /></Panel></div>
      {brands.length === 0 ? <Empty>Henüz marka yok. Marka ekleyince her markaya özel menü adresi oluşur.</Empty> : (
        <div className="space-y-4">
          {brands.map((b) => (
            <Card key={b.id} className="p-4">
              <div className={`flex min-w-0 flex-wrap items-end gap-3 ${b.active ? "" : "opacity-60"}`}>
                <BrandForm initial={{ id: b.id, name: b.name, slug: b.slug }} />
                <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
                  <code className="max-w-full break-all rounded bg-surface px-2 py-1 text-xs text-muted">/menu/{storeId.slice(0, 8)}…?marka={b.slug}</code>
                  {!b.active && <Badge>Pasif</Badge>}
                  <form action={toggleBrand.bind(null, b.id, !b.active)}><button className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">{b.active ? "Pasifleştir" : "Aktifleştir"}</button></form>
                </div>
              </div>
              <p className="mt-2 break-words text-sm text-muted">Menü adresi: <span className="break-all text-ink">/menu/{storeId}?marka={b.slug}</span> · Seçki: {selByBrand.get(b.id)?.size ?? 0} ürün {selByBrand.get(b.id)?.size ? "" : "(tümü)"}</p>
              {b.active && sellable.length > 0 && (
                <details className="mt-1">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Menü seçkisini düzenle</summary>
                  <ProductPicker brandId={b.id} products={sellable.map((p) => ({ id: p.id, name: p.name, category: p.category }))} selected={selByBrand.get(b.id) ?? new Set()} />
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
