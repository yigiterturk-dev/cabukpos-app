import { formatTL } from "@/lib/core/money";
import { WEEKDAYS, type Heat } from "@/lib/core/report";
import { Card, Empty } from "@/components/ui";

export function HeatTab({ h }: { h: Heat }) {
  if (h.max <= 0) return <Empty>Bu aralıkta satış yok.</Empty>;
  return (
    <Card className="overflow-x-auto p-4">
      <table className="text-xs" data-testid="heat">
        <thead><tr><th />{Array.from({ length: 24 }, (_, i) => <th key={i} className="w-9 pb-1 font-normal text-muted">{i}</th>)}</tr></thead>
        <tbody>
          {h.cells.map((row, d) => (
            <tr key={d}>
              <th className="pr-2 text-left font-medium">{WEEKDAYS[d]}</th>
              {row.map((c, i) => (
                <td key={i} title={`${WEEKDAYS[d]} ${i}:00 · ${formatTL(c.gross)} · ${c.count} fiş`} className="h-8 w-9 border border-white" style={{ backgroundColor: c.gross > 0 ? `color-mix(in srgb, var(--color-brand) ${Math.round(12 + (c.gross / h.max) * 88)}%, white)` : "#f5f5f4" }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Koyu hücre = yüksek ciro. Üzerine gelince tutar ve fiş sayısı.</p>
    </Card>
  );
}
