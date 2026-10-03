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
  const L = schema.priceLists, I = schema.priceListItems, P = schema.products;
  const [lists, items, prods] = await withTenant(a.tenantId, (tx) =>
    Promise.all([
      tx.select().from(L).orderBy(desc(L.active), asc(L.sort), asc(L.name)),
      tx.select({ id: I.id, listId: I.listId, productId: I.productId, price: I.price, name: P.name, base: P.price }).from(I).innerJoin(P, eq(P.id, I.productId)),
      tx.select({ id: P.id, name: P.name }).from(P).where(eq(P.active, true)).orderBy(asc(P.name)),
    ]),
  );
  const products: Option[] = prods.map((p) => ({ value: p.id, label: p.name }));
  return (
    <>
      <PageHeader title="Fiyat listeleri" desc="Belirli gün + saat aralığında seçili ürünlerin fiyatını ezer: happy hour, öğle menüsü fiyatı, akşam indirimi. Kasa, satır eklenirken geçerli fiyatı kullanır; saat dışı satış taban fiyatla akar." />
      <div className="mb-6"><Panel title="Liste ekle"><ListForm /></Panel></div>
      {lists.length === 0 ? <Empty>Henüz fiyat listesi yok. Örneğin &quot;Happy Hour&quot; listesi ekleyip içine ürün fiyatı girin.</Empty> : (
        <div className="space-y-4">
          {lists.map((l) => {
            const mine = items.filter((i) => i.listId === l.id);
            return (
              <Card key={l.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`font-semibold ${l.active ? "" : "opacity-60"}`}>{l.name}</span>
                  <Badge>{l.days.length === 0 ? "Her gün" : l.days.map((d) => GUNLER[d]).join(" · ")}</Badge>
                  <span className="text-sm tabular text-muted">{hm(l.startMin)} – {hm(l.endMin)}{l.endMin <= l.startMin ? " (ertesi gün)" : ""}</span>
                  <ListToggles id={l.id} active={l.active} />
                </div>
                {l.active && (
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
