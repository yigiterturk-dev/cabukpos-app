import Link from "next/link";
import { qtyText, type Range } from "@/lib/core/report";
import type { productData } from "@/lib/admin/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { reportHref } from "./RangeBar";

const th = "px-4 py-2.5 font-medium", td = "px-4 py-2.5 text-right tabular-nums";
export function ProductsTab({ d, range, sort, money }: { d: Awaited<ReturnType<typeof productData>>; range: Range; sort: "adet" | "ciro"; money: (k: number) => string }) {
  const cat = new Map(d.categories.map((c) => [c.key, c.name]));
  const sortLink = (k: "adet" | "ciro", label: string) => <Link href={reportHref("urunler", range, { sirala: k })} className={`rounded px-1 underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${sort === k ? "font-semibold text-brand" : ""}`}>{label}</Link>;
  return (
    <div className="space-y-6">
      {d.rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead className={TABLE_HEAD}><tr><th className={th}>Ürün</th><th className={th}>Kategori</th><th className={`${th} text-right`}>{sortLink("adet", "Adet")}</th><th className={`${th} text-right`}>{sortLink("ciro", "Brüt")}</th><th className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.rows.map((r) => (
            <tr key={r.key} data-testid={`product-${r.name}`}><td className="max-w-[20rem] px-4 py-2.5 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td><td className="max-w-[14rem] px-4 py-2.5 text-muted"><span className="block truncate" title={cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}>{cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}</span></td><td className={td}>{qtyText(r.qtyMilli)}</td><td className={td}>{money(r.gross)}</td><td className={td}>%{r.share.toFixed(1)}</td></tr>
          ))}</tbody>
        </table></Card>
      )}
      {d.categories.length > 0 && (
        <Card className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
          <thead className={TABLE_HEAD}><tr><th className={th}>Kategori</th><th className={`${th} text-right`}>Brüt</th><th className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.categories.map((c) => <tr key={c.key}><td className="px-4 py-2.5">{c.name}</td><td className={td}>{money(c.gross)}</td><td className={td}>%{c.share.toFixed(1)}</td></tr>)}</tbody>
        </table></Card>
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
