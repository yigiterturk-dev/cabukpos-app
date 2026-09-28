import Link from "next/link";
import { formatTL } from "@/lib/core/money";
import { qtyText, type Range } from "@/lib/core/report";
import type { productData } from "@/lib/admin/report";
import { Card, Empty } from "@/components/ui";
import { reportHref } from "./RangeBar";

const th = "px-4 py-2.5 font-medium", td = "px-4 py-2.5 text-right tabular-nums";
export function ProductsTab({ d, range, sort }: { d: Awaited<ReturnType<typeof productData>>; range: Range; sort: "adet" | "ciro" }) {
  const cat = new Map(d.categories.map((c) => [c.key, c.name]));
  const sortLink = (k: "adet" | "ciro", label: string) => <Link href={reportHref("urunler", range, { sirala: k })} className={sort === k ? "font-semibold text-brand underline" : "underline"}>{label}</Link>;
  return (
    <div className="space-y-6">
      {d.rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className={th}>Ürün</th><th className={th}>Kategori</th><th className={`${th} text-right`}>{sortLink("adet", "Adet")}</th><th className={`${th} text-right`}>{sortLink("ciro", "Brüt")}</th><th className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.rows.map((r) => (
            <tr key={r.key} data-testid={`product-${r.name}`}><td className="px-4 py-2.5 font-medium">{r.name}</td><td className="px-4 py-2.5 text-muted">{cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}</td><td className={td}>{qtyText(r.qtyMilli)}</td><td className={td}>{formatTL(r.gross)}</td><td className={td}>%{r.share.toFixed(1)}</td></tr>
          ))}</tbody>
        </table></Card>
      )}
      {d.categories.length > 0 && (
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className={th}>Kategori</th><th className={`${th} text-right`}>Brüt</th><th className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.categories.map((c) => <tr key={c.key}><td className="px-4 py-2.5">{c.name}</td><td className={td}>{formatTL(c.gross)}</td><td className={td}>%{c.share.toFixed(1)}</td></tr>)}</tbody>
        </table></Card>
      )}
      <Card className="p-4" data-testid="unsold">
        <h2 className="mb-2 font-semibold">Hiç satılmayanlar ({d.unsold.length})</h2>
        {d.unsold.length ? <p className="text-sm">{d.unsold.map((u) => u.name).join(", ")}</p> : <p className="text-sm text-muted">Tüm aktif ürünler bu aralıkta en az bir kez satıldı.</p>}
      </Card>
    </div>
  );
}
