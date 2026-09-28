import { formatTL } from "@/lib/core/money";
import { pctChange } from "@/lib/core/report";
import type { summaryData } from "@/lib/admin/report";
import { Card, Empty } from "@/components/ui";

type Data = Awaited<ReturnType<typeof summaryData>>;
function Delta({ now, before }: { now: number; before: number }) {
  const p = pctChange(now, before);
  if (p === null) return <span className="text-xs text-muted">önceki dönem —</span>;
  return <span className={`text-xs tabular-nums ${p < 0 ? "text-red-700" : "text-emerald-700"}`}>{p >= 0 ? "+" : ""}{p.toFixed(1)}% önceki döneme göre</span>;
}
const Box = ({ label, value, testId, delta }: { label: string; value: string; testId: string; delta: React.ReactNode }) => (
  <Card className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums" data-testid={testId}>{value}</div>{delta}</Card>
);

export function SummaryTab({ d }: { d: Data }) {
  if (!d.now.count && !d.now.refunds) return <Empty>Bu aralıkta satış yok.</Empty>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Box label="Brüt ciro" value={formatTL(d.now.gross)} testId="sum-gross" delta={<Delta now={d.now.gross} before={d.before.gross} />} />
        <Box label="Fiş" value={String(d.now.count)} testId="sum-count" delta={<Delta now={d.now.count} before={d.before.count} />} />
        <Box label="Ortalama sepet" value={d.now.avg === null ? "—" : formatTL(d.now.avg)} testId="sum-avg" delta={<Delta now={d.now.avg ?? 0} before={d.before.avg ?? 0} />} />
      </div>
      <p className="text-sm text-muted">Net ciro (KDV hariç) <b className="tabular-nums text-ink">{formatTL(d.now.net)}</b> · İade {d.now.refunds} · <span className="tabular-nums">{formatTL(d.now.refundTotal)}</span></p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Kanal</th><th className="px-4 py-2.5 text-right font-medium">Fiş</th><th className="px-4 py-2.5 text-right font-medium">Brüt</th></tr></thead>
          <tbody className="divide-y divide-line">{d.channels.map((c) => <tr key={c.key}><td className="px-4 py-2.5">{c.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(c.gross)}</td></tr>)}</tbody>
        </table></Card>
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Ödeme</th><th className="px-4 py-2.5 text-right font-medium">Tutar</th></tr></thead>
          <tbody className="divide-y divide-line">{d.methods.map((m) => <tr key={m.key}><td className="px-4 py-2.5">{m.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(m.amount)}</td></tr>)}</tbody>
        </table></Card>
      </div>
    </div>
  );
}
