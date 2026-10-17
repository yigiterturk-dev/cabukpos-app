// components/reports/MusterilerTab.tsx — #40: RFM tablosu + kohort gridi.
import { Card } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import type { RfmData } from "@/lib/admin/rfm";
import { formatPhone, normalizePhone } from "@/lib/core/delivery";

const SEGMENT_TONE: Record<string, string> = {
  Şampiyon: "bg-ok-soft text-ok",
  Sadık: "bg-brand-soft text-brand",
  Yeni: "bg-surface-2 text-ink",
  Büyüyen: "bg-brand-soft text-brand",
  "Risk altında": "bg-warn-soft text-warn",
  Uyuyan: "bg-surface-2 text-muted",
  Kayıp: "bg-bad-soft text-bad",
};

export function MusterilerTab({ data, money }: { data: RfmData; money: (k: number) => string }) {
  const { summary, rows, cohorts } = data;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Kayıtlı müşteri" value={String(summary.total)} />
        <Stat label="Son 30 günde aktif" value={String(summary.active30)} />
        <Stat label="Son 30 günde yeni" value={String(summary.new30)} />
        <Stat label="30 gün müşteri cirosu" value={money(summary.spend30)} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Kohort: ilk sipariş ayına göre tekrar sipariş</h2>
        <p className="mb-3 text-xs text-muted">Hücre = o ayda sipariş veren müşteri oranı. İlk ay %100; sonraki aylar düşüş retention kaybıdır.</p>
        <HorizontalScrollRegion label="Müşteri kohort tablosu, yatay kaydırılabilir">
        <table aria-label="Müşteri kohort tablosu" className="w-full min-w-[720px] text-xs">
          <caption className="pb-2 text-left text-xs text-muted">İlk sipariş ayına göre müşteri grupları. Hücrelerde sonraki aylarda yeniden sipariş verenlerin oranı gösterilir.</caption>
          {cohorts.length > 0 && (
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">Kohort</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Boy</th>
                {cohorts[0]?.cells.map((c) => <th scope="col" key={c.offset} className="py-1.5 px-2 text-center font-medium">+{c.offset} ay</th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {cohorts.map((row) => (
              <tr key={row.month} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium tabular">{row.month}</th>
                <td className="py-1.5 pr-3 tabular text-muted">{row.size}</td>
                {row.cells.map((c) => {
                  const pct = c.customers > 0 ? Math.round((c.ordered / c.customers) * 100) : 0;
                  const bg = c.offset === 0 ? "bg-brand-soft text-brand" : pct >= 50 ? "bg-ok-soft" : pct >= 25 ? "bg-warn-soft" : pct > 0 ? "bg-surface-2" : "";
                  return (
                    <td key={c.offset} className="px-1 py-1 text-center">
                      <span className={`inline-block min-w-10 rounded px-1.5 py-0.5 tabular ${bg}`} title={`${c.ordered}/${c.customers}`}>{pct >= 100 ? "100" : pct > 0 ? pct : "·"}<span className="sr-only">% · {c.ordered} / {c.customers} müşteri yeniden sipariş verdi</span></span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {cohorts.length === 0 && <tr><td className="py-3 text-muted" colSpan={3}>Son 12 ayda paket siparişli müşteri yok.</td></tr>}
          </tbody>
        </table>
        </HorizontalScrollRegion>
      </Card>

      <div className="grid gap-3 lg:hidden">
        {rows.map((r) => {
          const phone = normalizePhone(r.phone);
          return (
          <Card key={r.customerId} className="min-w-0 p-4" data-testid="rfm-card">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words font-medium">{r.name}</h3>
                {phone ? <a href={`tel:+${phone}`} className="mt-1 inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{formatPhone(phone)}</a> : <span className="mt-1 block text-sm text-muted">{r.phone || "Telefon yok"}</span>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${SEGMENT_TONE[r.segment] ?? "bg-surface-2"}`}>{r.segment}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
              <Metric label="Sipariş" value={String(r.orders)} />
              <Metric label="Harcama" value={money(r.spend)} />
              <Metric label="Son sipariş" value={`${r.lastOrderAt.slice(0, 10)} · ${r.recencyDays} gün`} />
              <Metric label="R-F-M" value={`${r.r}-${r.f}-${r.m}`} />
            </dl>
          </Card>
          );
        })}
        {rows.length === 0 && <Card className="p-4 text-sm text-muted">Paket siparişi telefonla verilen müşteri yok; RFM paket siparişlerinden hesaplanır.</Card>}
      </div>

      <Card className="hidden p-0 lg:block">
        <HorizontalScrollRegion label="Müşteri segmentleri, yatay kaydırılabilir" className="rounded-2xl">
        <table aria-label="Müşteri segmentleri" className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th scope="col" className="px-4 py-2.5 font-medium">Müşteri</th><th scope="col" className="px-4 py-2.5 font-medium">Telefon</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Sipariş</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Harcama</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Son sipariş</th><th scope="col" className="px-4 py-2.5 text-center font-medium">R-F-M</th><th scope="col" className="px-4 py-2.5 font-medium">Segment</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.customerId} data-testid="rfm-row">
                <th scope="row" className="max-w-[14rem] px-4 py-2 text-left font-medium"><span className="block truncate" title={r.name}>{r.name}</span></th>
                <td className="max-w-[10rem] px-4 py-2 tabular text-muted"><span className="block truncate" title={r.phone}>{r.phone}</span></td>
                <td className="px-4 py-2 text-right tabular">{r.orders}</td>
                <td className="px-4 py-2 text-right tabular">{money(r.spend)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular text-muted">{r.lastOrderAt.slice(0, 10)} · {r.recencyDays} gün</td>
                <td className="px-4 py-2 text-center tabular text-muted">{r.r}-{r.f}-{r.m}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEGMENT_TONE[r.segment] ?? "bg-surface-2"}`}>{r.segment}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-4 py-6 text-center text-muted" colSpan={7}>Paket siparişi telefonla verilen müşteri yok; RFM paket siparişlerinden hesaplanır.</td></tr>}
          </tbody>
        </table>
        </HorizontalScrollRegion>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-xl font-semibold tabular">{value}</div></Card>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="break-words font-medium tabular">{value}</dd></div>;
}
