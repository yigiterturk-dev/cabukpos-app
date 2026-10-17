import Link from "next/link";
import { EVENT_LABEL, type Range, type StaffEvent, type StaffRow } from "@/lib/core/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { reportHref } from "./RangeBar";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const td = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";
const warn = (n: number) => (n ? `${td} font-medium text-warn` : `${td} text-muted`);

export function StaffTab({ rows, range, kisi, events, money }: { rows: StaffRow[]; range: Range; kisi: string | null; events: { events: StaffEvent[]; names: Map<string, string>; page: number; hasPrevious: boolean; hasNext: boolean; total: number } | null; money: (k: number) => string }) {
  const nt = (n: number, k?: number) => (n ? (k === undefined ? String(n) : `${n} · ${money(k)}`) : "—");
  if (!rows.length) return <Empty>Bu aralıkta personel hareketi yok.</Empty>;
  const cols = ["Personel", "Satış", "Fiş", "İade", "Adisyon iptali", "İkram", "İndirim", "İndirim + ikram payı", "Paket iptali", "Sepetten silme"];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:hidden">
        {rows.map((r) => (
          <Card key={r.staffId} className={`min-w-0 p-4 ${kisi === r.staffId ? "border-brand bg-brand-soft" : ""}`} data-testid={`staff-card-${r.name}`}>
            <Link href={reportHref("personel", range, { kisi: r.staffId })} className="inline-flex min-h-11 items-center rounded px-1 font-semibold underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{r.name}</Link>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
              <StaffMetric label="Satış" value={money(r.gross)} />
              <StaffMetric label="Fiş" value={String(r.count)} />
              <StaffMetric label="İade" value={nt(r.refunds, r.refundTotal)} warn={Boolean(r.refunds)} />
              <StaffMetric label="Adisyon iptali" value={nt(r.voids, r.voidTotal)} warn={Boolean(r.voids)} />
              <StaffMetric label="İkram" value={nt(r.comps, r.compTotal)} warn={Boolean(r.comps)} />
              <StaffMetric label="İndirim" value={nt(r.discounts)} warn={Boolean(r.discounts)} />
              <StaffMetric label="İndirim + ikram payı" value={r.discountTotal ? money(r.discountTotal) : "—"} />
              <StaffMetric label="Paket iptali" value={nt(r.cancels)} warn={Boolean(r.cancels)} />
              <StaffMetric label="Sepetten silme" value={nt(r.removed, r.removedTotal)} warn={Boolean(r.removed)} />
            </dl>
          </Card>
        ))}
      </div>
      <Card className="hidden p-0 lg:block"><HorizontalScrollRegion label="Personel performans tablosu, yatay kaydırılabilir" className="rounded-2xl"><table aria-label="Personel performansı" className="w-full min-w-[980px] text-sm">
        <thead className={TABLE_HEAD}><tr>{cols.map((h, i) => <th scope="col" key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => (
          <tr key={r.staffId} data-testid={`staff-${r.name}`} className={kisi === r.staffId ? "bg-brand-soft" : "hover:bg-surface-2"}>
            <td className="px-4 py-2.5"><Link href={reportHref("personel", range, { kisi: r.staffId })} className="rounded px-1 font-medium underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{r.name}</Link></td>
            <td className={td}>{money(r.gross)}</td><td className={td}>{r.count}</td>
            <td className={warn(r.refunds)} data-testid="staff-refund">{nt(r.refunds, r.refundTotal)}</td>
            <td className={warn(r.voids)} data-testid="staff-void">{nt(r.voids, r.voidTotal)}</td>
            <td className={warn(r.comps)}>{nt(r.comps, r.compTotal)}</td>
            <td className={warn(r.discounts)}>{nt(r.discounts)}</td>
            <td className={td}>{r.discountTotal ? money(r.discountTotal) : "—"}</td>
            <td className={warn(r.cancels)}>{nt(r.cancels)}</td>
            <td className={warn(r.removed)} data-testid="staff-removed">{nt(r.removed, r.removedTotal)}</td>
          </tr>
        ))}</tbody>
      </table></HorizontalScrollRegion></Card>
      {kisi && events && (
        <Card data-testid="staff-events">
          <div className="flex items-baseline justify-between px-4 pt-4"><h2 className="font-semibold">{rows.find((r) => r.staffId === kisi)?.name ?? "Personel"} — olaylar</h2><a href={`/yonetim/raporlar/csv?sekme=olaylar&bas=${range.bas}&bit=${range.bit}&kisi=${kisi}`} download className="rounded px-1 text-sm underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">CSV indir</a></div>
          {events.events.length === 0 ? <p className="p-4 text-sm text-muted">Bu aralıkta olay yok.</p> : (
            <>
            <div className="mt-2 grid gap-2 px-3 pb-3 lg:hidden">
              {events.events.map((e, i) => (
                <article key={i} className="min-w-0 rounded-xl border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <h3 className="font-medium">{EVENT_LABEL[e.kind]}</h3>
                    <time className="text-xs tabular text-muted">{dt(e.at)}</time>
                  </div>
                  <p className="mt-2 break-words">{e.text}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2">
                    <StaffMetric label="Tutar" value={e.amount === null ? "—" : money(e.amount)} />
                    <StaffMetric label="Onaylayan" value={e.approvedBy ? events.names.get(e.approvedBy) ?? "Bilinmeyen" : "—"} />
                    <div className="col-span-2 min-w-0"><StaffMetric label="Gerekçe" value={e.reason ?? "—"} /></div>
                  </dl>
                </article>
              ))}
            </div>
            <HorizontalScrollRegion label="Personel olayları, yatay kaydırılabilir" className="mt-2 hidden lg:block">
            <table aria-label="Personel olayları" className="w-full min-w-[760px] text-sm">
              <thead className={TABLE_HEAD}><tr>{["Zaman", "Tür", "İçerik", "Tutar", "Onaylayan", "Gerekçe"].map((h) => <th scope="col" key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{events.events.map((e, i) => (
                <tr key={i}><td className="px-4 py-2.5 whitespace-nowrap">{dt(e.at)}</td><td className="px-4 py-2.5">{EVENT_LABEL[e.kind]}</td><td className="px-4 py-2.5">{e.text}</td><td className="px-4 py-2.5 tabular-nums">{e.amount === null ? "—" : money(e.amount)}</td><td className="px-4 py-2.5">{e.approvedBy ? events.names.get(e.approvedBy) ?? "Bilinmeyen" : "—"}</td><td className="px-4 py-2.5 text-muted">{e.reason ?? "—"}</td></tr>
              ))}</tbody>
            </table>
            </HorizontalScrollRegion>
            </>
          )}
          {(events.hasPrevious || events.hasNext) && <nav aria-label="Personel olayları sayfaları" className="flex items-center justify-between gap-3 border-t border-line p-3">
            <span className="text-sm text-muted">{(events.page - 1) * 50 + 1}–{Math.min(events.page * 50, events.total)} / {events.total} olay</span>
            <div className="flex gap-2">
              {events.hasPrevious ? <Link href={reportHref("personel", range, { kisi: kisi!, page: String(events.page - 1) })} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link>
                : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm text-muted opacity-50">Önceki</span>}
              {events.hasNext ? <Link href={reportHref("personel", range, { kisi: kisi!, page: String(events.page + 1) })} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link>
                : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm text-muted opacity-50">Sonraki</span>}
            </div>
          </nav>}
        </Card>
      )}
    </div>
  );
}

function StaffMetric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className={`break-words font-medium tabular-nums ${warn ? "text-warn" : ""}`}>{value}</dd></div>;
}
