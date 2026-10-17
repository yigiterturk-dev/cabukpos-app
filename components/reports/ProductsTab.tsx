import Link from "next/link";
import { qtyText, type Range } from "@/lib/core/report";
import type { productData } from "@/lib/admin/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { reportHref } from "./RangeBar";

const th = "px-4 py-2.5 font-medium", td = "px-4 py-2.5 text-right tabular-nums";
export function ProductsTab({ d, range, sort, money }: { d: Awaited<ReturnType<typeof productData>>; range: Range; sort: "adet" | "ciro"; money: (k: number) => string }) {
  const cat = new Map(d.categories.map((c) => [c.key, c.name]));
  const sortLink = (k: "adet" | "ciro", label: string) => <Link href={reportHref("urunler", range, { sirala: k })} className={`rounded px-1 underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${sort === k ? "font-semibold text-brand" : ""}`}>{label}</Link>;
  return (
    <div className="space-y-6">
      {d.rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
        <>
        <div className="grid gap-3 lg:hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm"><span className="text-muted">Sırala:</span>{sortLink("adet", "Adet")}{sortLink("ciro", "Brüt ciro")}</div>
          {d.rows.map((r) => (
            <Card key={r.key} className="min-w-0 p-4">
              <h2 className="break-words font-medium">{r.name}</h2>
              <p className="mt-0.5 break-words text-sm text-muted">{cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
                <div><dt className="text-xs text-muted">Adet</dt><dd className="font-medium tabular-nums">{qtyText(r.qtyMilli)}</dd></div>
                <div><dt className="text-xs text-muted">Brüt ciro</dt><dd className="font-medium tabular-nums">{money(r.gross)}</dd></div>
                <div><dt className="text-xs text-muted">Pay</dt><dd className="font-medium tabular-nums">%{r.share.toFixed(1)}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
        <Card className="hidden p-0 lg:block"><HorizontalScrollRegion label="Ürün satışları, yatay kaydırılabilir" className="rounded-2xl"><table aria-label="Ürün satışları" className="w-full min-w-[720px] text-sm">
          <thead className={TABLE_HEAD}><tr><th scope="col" className={th}>Ürün</th><th scope="col" className={th}>Kategori</th><th scope="col" className={`${th} text-right`}>{sortLink("adet", "Adet")}</th><th scope="col" className={`${th} text-right`}>{sortLink("ciro", "Brüt")}</th><th scope="col" className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.rows.map((r) => (
            <tr key={r.key} data-testid={`product-${r.name}`}><td className="max-w-[20rem] px-4 py-2.5 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td><td className="max-w-[14rem] px-4 py-2.5 text-muted"><span className="block truncate" title={cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}>{cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}</span></td><td className={td}>{qtyText(r.qtyMilli)}</td><td className={td}>{money(r.gross)}</td><td className={td}>%{r.share.toFixed(1)}</td></tr>
          ))}</tbody>
        </table></HorizontalScrollRegion></Card>
        </>
      )}
      {d.categories.length > 0 && (
        <>
        <div className="grid gap-2 lg:hidden">
          <h2 className="font-semibold">Kategori özeti</h2>
          {d.categories.map((c) => <Card key={c.key} className="flex min-w-0 items-center justify-between gap-3 p-3"><span className="min-w-0 break-words font-medium">{c.name}</span><span className="shrink-0 text-right text-sm tabular-nums">{money(c.gross)}<span className="ml-2 text-xs text-muted">%{c.share.toFixed(1)}</span></span></Card>)}
        </div>
        <Card className="hidden p-0 lg:block"><HorizontalScrollRegion label="Kategori satışları, yatay kaydırılabilir" className="rounded-2xl"><table aria-label="Kategori satışları" className="w-full min-w-[420px] text-sm">
          <thead className={TABLE_HEAD}><tr><th scope="col" className={th}>Kategori</th><th scope="col" className={`${th} text-right`}>Brüt</th><th scope="col" className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.categories.map((c) => <tr key={c.key}><td className="px-4 py-2.5">{c.name}</td><td className={td}>{money(c.gross)}</td><td className={td}>%{c.share.toFixed(1)}</td></tr>)}</tbody>
        </table></HorizontalScrollRegion></Card>
        </>
      )}
      <Card className="p-4" data-testid="unsold">
        <h2 className="mb-2 font-semibold">Hiç satılmayanlar ({d.unsold.length})</h2>
        {d.unsold.length ? (
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {d.unsold.map((u) => (
              <li
                key={u.id}
                title={u.name}
                className="min-w-0 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 font-medium text-ink-2"
              >
                {u.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Tüm aktif ürünler bu aralıkta en az bir kez satıldı.</p>
        )}
      </Card>
    </div>
  );
}
