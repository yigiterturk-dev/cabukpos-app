// QR menü + self-order kiosko (herkese açık). k sırrı URL'de yoksa yalnız menü görünür.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { kioskConn, menuByStore, type MenuData } from "@/lib/kiosk";
import { menuByBrand } from "@/lib/brands";
import { clientIp, hit } from "@/lib/ratelimit";
import { formatReceipt, isCurrency } from "@/lib/core/money";
import { Cart, Add, WaiterCall } from "./Cart";
import { Empty } from "@/components/ui";
import { SkipToContent } from "@/components/SkipToContent";
import { RateLimitNotice } from "@/components/RateLimitNotice";
import { UtensilsCrossed } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ marka?: string }> }): Promise<Metadata> {
  const { storeId } = await params;
  const { marka } = await searchParams;
  const m: (MenuData & { brand?: string }) | null = marka ? await menuByBrand(storeId, marka) : await menuByStore(storeId);
  const title = m ? `${m.brand ? m.brand + " · " : ""}${m.store} · Menü` : "Menü";
  return { title, robots: { index: false, follow: false } };
}

export default async function Menu({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ k?: string; marka?: string }> }) {
  const { storeId } = await params;
  const { k, marka } = await searchParams;
  if ((await hit(`menu:${await clientIp()}`, 1)) > 60) {
    return <RateLimitNotice resource="Menü" />;
  }
  const menu: (MenuData & { brand?: string }) | null = marka ? await menuByBrand(storeId, marka) : await menuByStore(storeId);
  if (!menu) notFound();
  const [tenant] = await getDb().select({ currency: schema.tenants.currency }).from(schema.stores).innerJoin(schema.tenants, eq(schema.tenants.id, schema.stores.tenantId)).where(eq(schema.stores.id, storeId));
  const currency = isCurrency(tenant?.currency) ? tenant.currency : "TRY";
  const conn = k ? Boolean(await kioskConn(storeId, k)) : false;
  const cats = menu.categories.filter((c) => menu.products.some((p) => p.categoryId === c.id));
  const uncategorized = menu.products.filter((p) => !p.categoryId);
  const groups = [...cats.map((c) => ({ name: c.name, items: menu.products.filter((p) => p.categoryId === c.id) })), ...(uncategorized.length ? [{ name: "Diğer", items: uncategorized }] : [])];
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8" style={{ paddingBottom: "var(--kiosk-cart-space, 6rem)" }}>
      <SkipToContent />
      <header className="mb-6">
        <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-brand" title={menu.tenant}>{menu.tenant}</p>
        <h1 id="main-content" tabIndex={-1} className="break-words rounded-sm font-display text-2xl font-bold text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" title={menu.brand ? `${menu.brand} · ${menu.store}` : menu.store}>{menu.brand ? `${menu.brand} · ${menu.store}` : menu.store}</h1>
        <p className="mt-1 break-words text-sm text-muted">{conn ? "Seç, sepeti onayla — siparişin mutfağa düşsün." : "Menü. Sipariş için kasa ya da garson yardımcı olur."}</p>
        {conn && <a href="#kiosk-cart" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-brand outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sepete git</a>}
      </header>
      {groups.map((g) => (
        <section key={g.name} className="mb-7">
          <h2 className="mb-2 border-b border-line pb-1 text-sm font-semibold uppercase tracking-wide text-muted">{g.name}</h2>
          <ul className="divide-y divide-line">
            {g.items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink" title={p.name}>{p.name}</span>
                <span className="shrink-0 tabular text-sm text-ink-2">{formatReceipt(p.price, currency)}{p.kind === "tartili" ? "/kg" : ""}</span>
                {conn && p.kind === "tartili" && <span className="shrink-0 text-xs text-muted">Kasada tartılır</span>}
                {conn && p.kind === "adet" && <Add id={p.id} name={p.name} price={p.price} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {menu.products.length === 0 && <Empty icon={<UtensilsCrossed aria-hidden />}>Menü henüz boş. Ürünler yönetim paneline eklendiğinde burada görünür.</Empty>}
      {conn && <Cart storeId={storeId} secret={k!} vertical={menu.vertical} currency={currency} />}
      {conn && menu.vertical === "restoran" && menu.tables.length > 0 && <WaiterCall storeId={storeId} secret={k!} tables={menu.tables} />}
      {!conn && <p className="mt-10 text-center text-xs text-muted">ÇabukPOS ile hazırlanmıştır.</p>}
    </main>
  );
}
