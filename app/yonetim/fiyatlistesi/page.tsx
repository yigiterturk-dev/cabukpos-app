import { asc, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { ListForm, ItemForm, ListToggles, ItemDelete } from "@/components/admin/PriceListForms";
import { Badge, Card, Empty, PageHeader, Panel } from "@/components/ui";
import { formatTL } from "@/lib/core/money";
import type { Option } from "@/components/Select";

export const dynamic = "force-dynamic";

const GUNLER = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export default async function FiyatListesi() {
  const a = await requireAdmin();
  const L = schema.priceLists, I = schema.priceListItems, P = schema.products, C = schema.categories;
  const [lists, items, prods, cats] = await withTenant(a.tenantId, (tx) =>
    Promise.all([
      tx.select().from(L).orderBy(desc(L.active), asc(L.sort), asc(L.name)),
      tx.select({ id: I.id, listId: I.listId, productId: I.productId, price: I.price, name: P.name, base: P.price }).from(I).innerJoin(P, eq(P.id, I.productId)),
      tx.select({ id: P.id, name: P.name }).from(P).where(eq(P.active, true)).orderBy(asc(P.name)),
      tx.select({ id: C.id, name: C.name }).from(C).orderBy(asc(C.sort), asc(C.name)),
    ]),
  );
  const products: Option[] = prods.map((p) => ({ value: p.id, label: p.name }));
  const categories: Option[] = cats.map((c) => ({ value: c.id, label: c.name }));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader title="Fiyat listeleri ve indirimler" desc="Belirli gün + saat aralığında geçerli liste. İki tür: ürün başı sabit fiyat (happy hour, öğle menüsü) ya da kapsama göre yüzde indirim (tüm ürünler veya seçili kategoriler). Kasa, satır eklenirken geçerli fiyatı kullanır; saat dışı taban fiyatla akar." />
      <div className="mb-6"><Panel title="Liste / indirim ekle"><ListForm categories={categories} /></Panel></div>
      {lists.length === 0 ? <Empty>Henüz liste yok. Örneğin &quot;Happy Hour %20 (tüm ürünler)&quot; ya da kategorili bir indirim ekleyin.</Empty> : (
        <div className="space-y-4">
          {lists.map((l) => {
            const mine = items.filter((i) => i.listId === l.id);
            const yuzde = l.kind === "yuzde";
            const scope = yuzde ? (l.categoryIds && l.categoryIds.length ? l.categoryIds.map((id) => catName.get(id)).filter(Boolean).join(" · ") : "Tüm ürünler") : null;
            return (
              <Card key={l.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`font-semibold ${l.active ? "" : "opacity-60"}`}>{l.name}</span>
                  {yuzde ? <Badge tone="brand">Yüzde %{l.percent}</Badge> : <Badge>Ürün başı fiyat</Badge>}
                  <Badge>{l.days.length === 0 ? "Her gün" : l.days.map((d) => GUNLER[d]).join(" · ")}</Badge>
                  <span className="text-sm tabular text-muted">{hm(l.startMin)} – {hm(l.endMin)}{l.endMin <= l.startMin ? " (ertesi gün)" : ""}</span>
                  <ListToggles id={l.id} active={l.active} />
                </div>
                {yuzde ? (
                  <p className="mt-3 text-sm text-muted">Kapsam: <b className="text-ink-2">{scope}</b>. Aktif olduğu saatlerde kapsamdaki ürünlerin fiyatı %{l.percent} indirilir; kasa satır eklenirken donar.</p>
                ) : l.active && (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    <ItemForm listId={l.id} products={products} />
                    {mine.length === 0 ? <p className="text-sm text-muted">Ürün fiyatı yok: listeye ürün ekleyin.</p> : (
                      <div className="divide-y divide-line rounded-xl border border-line">
                        {mine.map((i) => (
                          <div key={i.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                            <span className="font-medium">{i.name}</span>
                            <span className="tabular text-muted">taban {formatTL(i.base)}</span>
                            <span className="tabular font-semibold text-ok">{formatTL(i.price)}</span>
                            <div className="ml-auto"><ItemDelete listId={l.id} id={i.id} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
