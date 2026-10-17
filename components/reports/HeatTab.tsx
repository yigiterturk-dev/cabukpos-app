import { WEEKDAYS, type Heat } from "@/lib/core/report";
import { Card, Empty } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export function HeatTab({ h, money }: { h: Heat; money: (k: number) => string }) {
  if (h.max <= 0) return <Empty>Bu aralıkta satış yok.</Empty>;
  const days = h.cells.map((cells) => cells.reduce((day, cell) => ({ gross: day.gross + cell.gross, count: day.count + cell.count }), { gross: 0, count: 0 }));
  return (
    <Card className="p-4">
      <div className="grid gap-2 lg:hidden">
        {days.map((day, d) => {
          const peak = h.cells[d].reduce((best, cell, hour) => cell.gross > h.cells[d][best].gross ? hour : best, 0);
          return <div key={d} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <h2 className="w-12 shrink-0 font-medium">{WEEKDAYS[d]}</h2>
            <dl className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-right text-sm">
              <div><dt className="text-xs text-muted">Ciro</dt><dd className="truncate font-medium tabular-nums">{money(day.gross)}</dd></div>
              <div><dt className="text-xs text-muted">Fiş</dt><dd className="font-medium tabular-nums">{day.count}</dd></div>
              <div><dt className="text-xs text-muted">Yoğun saat</dt><dd className="font-medium tabular-nums">{day.gross > 0 ? `${peak}:00` : "—"}</dd></div>
            </dl>
          </div>;
        })}
      </div>
      <HorizontalScrollRegion label="Saatlik ciro ısı haritası, yatay kaydırılabilir" className="lg:mt-0">
      <table aria-label="Gün ve saate göre ciro yoğunluğu" className="sr-only text-xs lg:not-sr-only" data-testid="heat">
        <caption className="sr-only lg:not-sr-only lg:caption-top lg:pb-2 lg:text-left lg:text-xs lg:text-muted">Gün ve saate göre ciro yoğunluğu. Koyu hücreler yüksek ciroyu gösterir.</caption>
        <thead><tr><th scope="col"><span className="sr-only">Gün</span></th>{Array.from({ length: 24 }, (_, i) => <th scope="col" key={i} className="w-9 pb-1 font-normal text-muted">{i}:00</th>)}</tr></thead>
        <tbody>
          {h.cells.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-2 text-left font-medium">{WEEKDAYS[d]}</th>
              {row.map((c, i) => (
                <td key={i} title={`${WEEKDAYS[d]} ${i}:00 · ${money(c.gross)} · ${c.count} fiş`} className="h-8 w-9 border border-white" style={{ backgroundColor: c.gross > 0 ? `color-mix(in srgb, var(--color-brand) ${Math.round(12 + (c.gross / h.max) * 88)}%, white)` : "#f5f5f4" }}><span className="sr-only">{WEEKDAYS[d]} {i}:00, {money(c.gross)}, {c.count} fiş</span></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </HorizontalScrollRegion>
      <p className="mt-3 text-xs text-muted">Masaüstünde koyu hücre yüksek ciroyu gösterir; saatlik tutar ve fiş sayısı hücre üzerinde görünür. Telefonda günlük ciro, fiş sayısı ve en yoğun saat listelenir.</p>
    </Card>
  );
}
