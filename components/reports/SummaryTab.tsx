import { pctChange } from "@/lib/core/report";
import type { summaryData } from "@/lib/admin/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type Data = Awaited<ReturnType<typeof summaryData>>;
function Delta({ now, before }: { now: number; before: number }) {
  const p = pctChange(now, before);
  const Trend = p === null ? Minus : p < 0 ? ArrowDownRight : p > 0 ? ArrowUpRight : Minus;
  return <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${p === null ? "text-muted" : p < 0 ? "text-bad" : p > 0 ? "text-ok" : "text-muted"}`}><Trend aria-hidden className="size-3.5" />{p === null ? "önceki dönem —" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}% önceki döneme göre`}</span>;
}
const Box = ({ label, value, testId, delta }: { label: string; value: string; testId: string; delta: React.ReactNode }) => (
  <Card className="p-5"><div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div><div className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums" data-testid={testId}>{value}</div><div className="mt-2">{delta}</div></Card>
);

export function SummaryTab({ d, money }: { d: Data; money: (k: number) => string }) {
  if (!d.now.count && !d.now.refunds) return <Empty>Bu aralıkta satış yok.</Empty>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Box label="Brüt ciro" value={money(d.now.gross)} testId="sum-gross" delta={<Delta now={d.now.gross} before={d.before.gross} />} />
        <Box label="Fiş" value={String(d.now.count)} testId="sum-count" delta={<Delta now={d.now.count} before={d.before.count} />} />
        <Box label="Ortalama sepet" value={d.now.avg === null ? "—" : money(d.now.avg)} testId="sum-avg" delta={<Delta now={d.now.avg ?? 0} before={d.before.avg ?? 0} />} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-sm">
        <span className="text-muted">Net ciro <span className="text-xs">(KDV hariç)</span></span>
        <span className="tabular-nums text-lg font-semibold">{money(d.now.net)}</span>
        <span className="text-xs text-muted">İade: <b className="tabular-nums text-ink">{d.now.refunds}</b> · <span className="tabular-nums">{money(d.now.refundTotal)}</span></span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4 lg:hidden">
          <h2 className="mb-2 font-semibold">Satış kanalı</h2>
          {d.channels.length ? <ul className="divide-y divide-line text-sm">{d.channels.map((c) => <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2"><span className="min-w-0 break-words font-medium">{c.label}</span><span className="text-right tabular-nums">{money(c.gross)}</span><span className="text-xs text-muted">Fiş</span><span className="text-right text-xs tabular-nums text-muted">{c.count}</span></li>)}</ul> : <p className="text-sm text-muted">Kanal verisi yok.</p>}
        </Card>
        <Card className="hidden p-0 lg:block"><HorizontalScrollRegion label="Satış kanalı tablosu, yatay kaydırılabilir" className="rounded-2xl"><table aria-label="Satış kanalı" className="w-full min-w-[420px] text-sm">
          <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Kanal</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Fiş</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Brüt</th></tr></thead>
          <tbody className="divide-y divide-line">{d.channels.map((c) => <tr key={c.key} className="transition-colors hover:bg-surface-2"><td className="px-4 py-2.5">{c.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(c.gross)}</td></tr>)}</tbody>
        </table></HorizontalScrollRegion></Card>
        <Card className="p-4 lg:hidden">
          <h2 className="mb-2 font-semibold">Ödeme yöntemi</h2>
          {d.methods.length ? <ul className="divide-y divide-line text-sm">{d.methods.map((m) => <li key={m.key} className="flex min-w-0 items-center justify-between gap-3 py-2"><span className="min-w-0 break-words font-medium">{m.label}</span><span className="shrink-0 tabular-nums">{money(m.amount)}</span></li>)}</ul> : <p className="text-sm text-muted">Ödeme verisi yok.</p>}
        </Card>
        <Card className="hidden p-0 lg:block"><HorizontalScrollRegion label="Ödeme yöntemi tablosu, yatay kaydırılabilir" className="rounded-2xl"><table aria-label="Ödeme yöntemi" className="w-full min-w-[320px] text-sm">
          <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Ödeme</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Tutar</th></tr></thead>
          <tbody className="divide-y divide-line">{d.methods.map((m) => <tr key={m.key} className="transition-colors hover:bg-surface-2"><td className="px-4 py-2.5">{m.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(m.amount)}</td></tr>)}</tbody>
        </table></HorizontalScrollRegion></Card>
      </div>
    </div>
  );
}
