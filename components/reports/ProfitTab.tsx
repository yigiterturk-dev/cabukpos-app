import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { moneyFormatter } from "@/lib/admin/currency";
import { profitRows } from "@/lib/core/profit";
import type { Range } from "@/lib/core/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";

export async function ProfitTab({ tenantId, range }: { tenantId: string; range: Range }) {
  const money = await moneyFormatter(tenantId);
  const { bas, bit } = range;
    const L = schema.saleLines, S = schema.sales;
    const lines = await withTenant(tenantId, (tx) => tx.select({ productId: L.productId, name: L.name, qtyMilli: L.qtyMilli, total: L.total, vatRate: L.vatRate, cost: L.cost, status: S.status })
      .from(L).innerJoin(S, eq(S.id, L.saleId))
      .where(and(inArray(S.status, ["kapandi", "iade"]), gte(S.createdAt, new Date(`${bas}T00:00:00+03:00`)), lt(S.createdAt, new Date(new Date(`${bit}T00:00:00+03:00`).getTime() + 86400_000)))));
    const rows = profitRows(lines.map((l) => ({ key: l.productId ?? `ad:${l.name}`, name: l.name, qtyMilli: l.qtyMilli, total: l.total, vatRate: l.vatRate, cost: l.cost, refund: l.status === "iade" })));
    const sum = rows.reduce((t, r) => ({ net: t.net + r.net, cost: t.cost + r.cost, missing: t.missing + r.missing }), { net: 0, cost: 0, missing: 0 });
  return (
    <>
        {rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className={TABLE_HEAD}>
                <tr>{["Ürün", "Adet", "Net ciro", "Maliyet", "Brüt kâr", "Marj", "Maliyeti eksik"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
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
          </Card>
        )}
        {sum.missing > 0 && <p className="mt-3 text-sm text-warn">Maliyeti eksik satırlar: ürüne ya da reçetedeki hammaddeye alış girilmemiş. Bu satırların maliyeti 0 sayıldı, marjı gösterilmez.</p>}
    </>
  );
}
