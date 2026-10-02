// QR menü + self-order kiosko (herkese açık). k sırrı URL'de yoksa yalnız menü görünür.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kioskConn, menuByStore } from "@/lib/kiosk";
import { clientIp, hit } from "@/lib/ratelimit";
import { formatTL } from "@/lib/core/money";
import { Cart, Add } from "./Cart";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ storeId: string }> }): Promise<Metadata> {
  const m = await menuByStore((await params).storeId);
  return { title: m ? `${m.store} · Menü` : "Menü", robots: { index: false, follow: false } };
}

export default async function Menu({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ k?: string }> }) {
  const { storeId } = await params;
  const { k } = await searchParams;
  if ((await hit(`menu:${await clientIp()}`, 1)) > 60) {
    return <main className="grid min-h-dvh place-items-center p-8 text-center text-sm text-ink-2">Çok fazla istek. Bir dakika sonra tekrar deneyin.</main>;
  }
  const menu = await menuByStore(storeId);
  if (!menu) notFound();
  const conn = k ? Boolean(await kioskConn(storeId, k)) : false;
  const cats = menu.categories.filter((c) => menu.products.some((p) => p.categoryId === c.id));
  const uncategorized = menu.products.filter((p) => !p.categoryId);
  const groups = [...cats.map((c) => ({ name: c.name, items: menu.products.filter((p) => p.categoryId === c.id) })), ...(uncategorized.length ? [{ name: "Diğer", items: uncategorized }] : [])];
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{menu.tenant}</p>
        <h1 className="font-display text-2xl font-bold text-ink">{menu.store}</h1>
        <p className="mt-1 text-sm text-muted">{conn ? "Seç, sepeti onayla — siparişin mutfağa düşsün." : "Menü. Sipariş için kasa ya da garson yardımcı olur."}</p>
      </header>
      {groups.map((g) => (
        <section key={g.name} className="mb-7">
          <h2 className="mb-2 border-b border-line pb-1 text-sm font-semibold uppercase tracking-wide text-muted">{g.name}</h2>
          <ul className="divide-y divide-line">
            {g.items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">{p.name}</span>
                <span className="tabular text-sm text-ink-2">{formatTL(p.price)}{p.kind === "tartili" ? "/kg" : ""}</span>
                {conn && p.kind === "adet" && <Add id={p.id} name={p.name} price={p.price} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {menu.products.length === 0 && <p className="text-sm text-muted">Menü henüz boş.</p>}
      {conn && <Cart storeId={storeId} secret={k!} vertical={menu.vertical} />}
      {!conn && <p className="mt-10 text-center text-xs text-muted">ÇabukPOS ile hazırlanmıştır.</p>}
    </main>
  );
}
