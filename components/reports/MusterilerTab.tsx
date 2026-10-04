// components/reports/MusterilerTab.tsx — #40: RFM tablosu + kohort gridi.
import { formatTL } from "@/lib/core/money";
import { Card } from "@/components/ui";
import type { RfmData } from "@/lib/admin/rfm";

const SEGMENT_TONE: Record<string, string> = {
  Şampiyon: "bg-ok-soft text-ok",
  Sadık: "bg-brand-soft text-brand",
  Yeni: "bg-surface-2 text-ink",
  Büyüyen: "bg-brand-soft text-brand",
  "Risk altında": "bg-warn-soft text-warn",
  Uyuyan: "bg-surface-2 text-muted",
  Kayıp: "bg-bad-soft text-bad",
};

export function MusterilerTab({ data }: { data: RfmData }) {
  const { summary, rows, cohorts } = data;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Kayıtlı müşteri" value={String(summary.total)} />
        <Stat label="Son 30 günde aktif" value={String(summary.active30)} />
        <Stat label="Son 30 günde yeni" value={String(summary.new30)} />
        <Stat label="30 gün müşteri cirosu" value={formatTL(summary.spend30)} />
      </div>

      <Card className="overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Kohort: ilk sipariş ayına göre tekrar sipariş</h2>
        <p className="mb-3 text-xs text-muted">Hücre = o ayda sipariş veren müşteri oranı. İlk ay %100; sonraki aylar düşüş retention kaybıdır.</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 pr-3 font-medium">Kohort</th>
              <th className="py-1.5 pr-3 font-medium">Boy</th>
              {cohorts[0]?.cells.map((c) => <th key={c.offset} className="py-1.5 px-2 text-center font-medium">+{c.offset} ay</th>)}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((row) => (
              <tr key={row.month} className="border-t border-line">
                <td className="py-1.5 pr-3 font-medium tabular">{row.month}</td>
                <td className="py-1.5 pr-3 tabular text-muted">{row.size}</td>
                {row.cells.map((c) => {
                  const pct = c.customers > 0 ? Math.round((c.ordered / c.customers) * 100) : 0;
                  const bg = c.offset === 0 ? "bg-brand-soft text-brand" : pct >= 50 ? "bg-ok-soft" : pct >= 25 ? "bg-warn-soft" : pct > 0 ? "bg-surface-2" : "";
                  return (
                    <td key={c.offset} className="px-1 py-1 text-center">
                      <span className={`inline-block min-w-10 rounded px-1.5 py-0.5 tabular ${bg}`} title={`${c.ordered}/${c.customers}`}>{pct >= 100 ? "100" : pct > 0 ? pct : "·"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {cohorts.length === 0 && <tr><td className="py-3 text-muted" colSpan={3}>Son 12 ayda paket siparişli müşteri yok.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="px-4 py-2.5 font-medium">Müşteri</th><th className="px-4 py-2.5 font-medium">Telefon</th><th className="px-4 py-2.5 text-right font-medium">Sipariş</th><th className="px-4 py-2.5 text-right font-medium">Harcama</th><th className="px-4 py-2.5 text-right font-medium">Son sipariş</th><th className="px-4 py-2.5 text-center font-medium">R-F-M</th><th className="px-4 py-2.5 font-medium">Segment</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.customerId} data-testid="rfm-row">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 tabular text-muted">{r.phone}</td>
                <td className="px-4 py-2 text-right tabular">{r.orders}</td>
                <td className="px-4 py-2 text-right tabular">{formatTL(r.spend)}</td>
                <td className="px-4 py-2 text-right tabular text-muted">{r.lastOrderAt.slice(0, 10)} · {r.recencyDays} gün</td>
                <td className="px-4 py-2 text-center tabular text-muted">{r.r}-{r.f}-{r.m}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEGMENT_TONE[r.segment] ?? "bg-surface-2"}`}>{r.segment}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-4 py-6 text-center text-muted" colSpan={7}>Paket siparişi telefonla verilen müşteri yok; RFM paket siparişlerinden hesaplanır.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-xl font-semibold tabular">{value}</div></Card>;
}
