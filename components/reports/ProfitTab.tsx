import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { moneyFormatter } from "@/lib/admin/currency";
import { profitRows } from "@/lib/core/profit";
import type { Range } from "@/lib/core/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export async function ProfitTab({ tenantId, range, storeId }: { tenantId: string; range: Range; storeId: string | null }) {
  const money = await moneyFormatter(tenantId);
  const { bas, bit } = range;
    const L = schema.saleLines, S = schema.sales;
    const lines = await withTenant(tenantId, (tx) => tx.select({ productId: L.productId, name: L.name, qtyMilli: L.qtyMilli, total: L.total, vatRate: L.vatRate, cost: L.cost, status: S.status })
      .from(L).innerJoin(S, eq(S.id, L.saleId))
      .where(and(inArray(S.status, ["kapandi", "iade"]), storeId ? eq(S.storeId, storeId) : sql`false`, gte(S.createdAt, new Date(`${bas}T00:00:00+03:00`)), lt(S.createdAt, new Date(new Date(`${bit}T00:00:00+03:00`).getTime() + 86400_000)))));
    const rows = profitRows(lines.map((l) => ({ key: l.productId ?? `ad:${l.name}`, name: l.name, qtyMilli: l.qtyMilli, total: l.total, vatRate: l.vatRate, cost: l.cost, refund: l.status === "iade" })));
    const sum = rows.reduce((t, r) => ({ net: t.net + r.net, cost: t.cost + r.cost, missing: t.missing + r.missing }), { net: 0, cost: 0, missing: 0 });
  return (
    <>
        {rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
          <>
          <div className="grid gap-3 lg:hidden">
            <Card className="p-4">
              <h2 className="font-semibold">Dönem toplamı</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
                <ProfitMetric label="Net ciro" value={money(sum.net)} />
                <ProfitMetric label="Maliyet" value={money(sum.cost)} />
                <ProfitMetric label="Brüt kâr" value={money(sum.net - sum.cost)} className={sum.net < sum.cost ? "text-bad" : ""} />
                <ProfitMetric label="Maliyeti eksik" value={sum.missing ? String(sum.missing) : "—"} className={sum.missing ? "text-warn" : "text-muted"} />
              </dl>
            </Card>
            {rows.map((r) => (
              <Card key={r.key} className="min-w-0 p-4">
                <h3 className="break-words font-medium">{r.name}</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
                  <ProfitMetric label="Adet" value={(r.qtyMilli / 1000).toLocaleString("tr-TR")} />
                  <ProfitMetric label="Net ciro" value={money(r.net)} />
                  <ProfitMetric label="Maliyet" value={money(r.cost)} />
                  <ProfitMetric label="Brüt kâr" value={money(r.profit)} className={r.profit < 0 ? "text-bad" : ""} />
                  <ProfitMetric label="Marj" value={r.margin === null ? "—" : `%${r.margin.toFixed(1)}`} />
                  <ProfitMetric label="Maliyeti eksik" value={r.missing || "—"} className={r.missing ? "text-warn" : "text-muted"} />
                </dl>
              </Card>
            ))}
          </div>
          <Card className="hidden p-0 lg:block">
            <HorizontalScrollRegion label="Ürün kârlılığı, yatay kaydırılabilir" className="rounded-2xl">
            <table aria-label="Ürün kârlılığı" className="w-full min-w-[760px] text-sm">
              <thead className={TABLE_HEAD}>
                <tr>{["Ürün", "Adet", "Net ciro", "Maliyet", "Brüt kâr", "Marj", "Maliyeti eksik"].map((h, i) => <th scope="col" key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} data-testid={`profit-${r.name}`}>
                    <td className="max-w-[20rem] px-4 py-2.5 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{(r.qtyMilli / 1000).toLocaleString("tr-TR")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(r.net)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" data-testid="profit-cost">{money(r.cost)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.profit < 0 ? "text-bad" : ""}`}>{money(r.profit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" data-testid="profit-margin">{r.margin === null ? "—" : `%${r.margin.toFixed(1)}`}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.missing ? "text-warn" : "text-muted"}`}>{r.missing || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line font-medium">
                <tr><td className="px-4 py-2.5">Toplam</td><td /><td className="px-4 py-2.5 text-right tabular-nums">{money(sum.net)}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(sum.cost)}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(sum.net - sum.cost)}</td><td /><td className="px-4 py-2.5 text-right tabular-nums">{sum.missing || "—"}</td></tr>
              </tfoot>
            </table>
            </HorizontalScrollRegion>
          </Card>
          </>
        )}
        {sum.missing > 0 && <p className="mt-3 text-sm text-warn">Maliyeti eksik satırlar: ürüne ya da reçetedeki hammaddeye alış girilmemiş. Bu satırların maliyeti 0 sayıldı, marjı gösterilmez.</p>}
    </>
  );
}

function ProfitMetric({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className={`break-words font-medium tabular-nums ${className}`}>{value}</dd></div>;
}
