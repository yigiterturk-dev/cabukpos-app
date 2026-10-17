import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { tenantCurrency } from "@/lib/admin/currency";
import { stockUnitOf } from "@/lib/core/stock";
import { RecipeForm, type IngredientOption, type RecipeOwner } from "@/components/admin/RecipeForms";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Receteler({ searchParams }: { searchParams: Promise<{ urun?: string; secenek?: string }> }) {
  const a = await requireAdmin();
  if (a.vertical !== "restoran") notFound();
  const { urun, secenek } = await searchParams;
  const P = schema.products, R = schema.recipeItems;
  const [prods, groups, opts, items] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(P).where(eq(P.active, true)).orderBy(asc(P.name)),
    tx.select({ id: schema.optionGroups.id, name: schema.optionGroups.name }).from(schema.optionGroups).orderBy(asc(schema.optionGroups.sort), asc(schema.optionGroups.name)),
    tx.select({ id: schema.options.id, groupId: schema.options.groupId, name: schema.options.name, delta: schema.options.delta }).from(schema.options).orderBy(asc(schema.options.sort)),
    tx.select().from(R),
  ]));
  const has = new Set(items.flatMap((i) => [i.productId, i.optionId]).filter(Boolean));
  const sellable = prods.filter((p) => p.sellable);
  const intermediates = prods.filter((p) => !p.sellable && p.yieldMilli);
  const ingredients: IngredientOption[] = prods.filter((p) => p.trackStock && p.id !== urun).map((p) => ({ value: p.id, label: `${p.name}${p.sellable ? "" : p.yieldMilli ? " (ara ürün)" : ""}`, unit: stockUnitOf(p), cost: p.cost }));

  let owner: RecipeOwner | null = null;
  const sel = urun ? prods.find((p) => p.id === urun) : null;
  const opt = secenek ? opts.find((o) => o.id === secenek) : null;
  if (sel) owner = { productId: sel.id, name: sel.name, ...(sel.sellable ? { price: sel.price, vatRate: sel.vatRate } : { yieldMilli: sel.yieldMilli, unit: sel.unit }) };
  else if (opt) owner = { optionId: opt.id, name: `${groups.find((g) => g.id === opt.groupId)?.name ?? ""} › ${opt.name}` };
  const initial = items.filter((i) => (sel ? i.productId === sel.id : opt ? i.optionId === opt.id : false)).map((i) => ({ ingredientId: i.ingredientId, qtyMilli: i.qtyMilli }));

  const link = (href: string, label: string, active: boolean, done: boolean) => (
    <Link key={href} href={href} className={`flex min-h-11 items-center justify-between rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${active ? "bg-brand-soft font-medium text-brand" : "hover:bg-surface-2"}`}>
      <span className="min-w-0 break-words">{label}</span>{done && <span className="shrink-0 text-xs text-ok">reçeteli</span>}
    </Link>
  );
  return (
    <>
      <PageHeader title="Reçeteler" desc="Satışta hammaddeler reçeteye göre düşer; maliyet son alış fiyatından. Ara ürünü Üretim sayfasından üretin." />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="min-w-0 space-y-4 p-3">
          <div><h2 className="mb-1 px-3 text-xs font-medium uppercase text-muted">Ürünler</h2>{sellable.map((p) => link(`/yonetim/receteler?urun=${p.id}`, p.name, p.id === urun, has.has(p.id)))}</div>
          <div><h2 className="mb-1 px-3 text-xs font-medium uppercase text-muted">Ara ürünler</h2>{intermediates.length ? intermediates.map((p) => link(`/yonetim/receteler?urun=${p.id}`, p.name, p.id === urun, has.has(p.id))) : <p className="px-3 text-sm text-muted">Ürünler’de “Kasada satılır: Hayır” + parti miktarı.</p>}</div>
          {groups.map((g) => (
            <div key={g.id}><h2 className="mb-1 px-3 text-xs font-medium uppercase text-muted">Seçenek · {g.name}</h2>{opts.filter((o) => o.groupId === g.id).map((o) => link(`/yonetim/receteler?secenek=${o.id}`, o.name, o.id === secenek, has.has(o.id)))}</div>
          ))}
        </Card>
        <Card className="p-5">
          {owner ? (
            <>
              <h2 className="mb-3 font-semibold">{owner.name}</h2>
              <RecipeForm key={owner.productId ?? owner.optionId} owner={owner} ingredients={ingredients} initial={initial} currency={await tenantCurrency(a.tenantId)} />
            </>
          ) : <Empty>Soldan bir ürün, ara ürün ya da seçenek seçin.</Empty>}
        </Card>
      </div>
    </>
  );
}
