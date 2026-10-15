import Link from "next/link";
import { EVENT_LABEL, type Range, type StaffEvent, type StaffRow } from "@/lib/core/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { reportHref } from "./RangeBar";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const td = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";
const warn = (n: number) => (n ? `${td} font-medium text-warn` : `${td} text-muted`);

export function StaffTab({ rows, range, kisi, events, money }: { rows: StaffRow[]; range: Range; kisi: string | null; events: { events: StaffEvent[]; names: Map<string, string> } | null; money: (k: number) => string }) {
  const nt = (n: number, k?: number) => (n ? (k === undefined ? String(n) : `${n} · ${money(k)}`) : "—");
  if (!rows.length) return <Empty>Bu aralıkta personel hareketi yok.</Empty>;
  const cols = ["Personel", "Satış", "Fiş", "İade", "Adisyon iptali", "İkram", "İndirim", "İndirim + ikram payı", "Paket iptali", "Sepetten silme"];
  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm">
        <thead className={TABLE_HEAD}><tr>{cols.map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
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
      </table></Card>
      {kisi && events && (
        <Card className="overflow-x-auto" data-testid="staff-events">
          <div className="flex items-baseline justify-between px-4 pt-4"><h2 className="font-semibold">{rows.find((r) => r.staffId === kisi)?.name ?? "Personel"} — olaylar</h2><a href={`/yonetim/raporlar/csv?sekme=olaylar&bas=${range.bas}&bit=${range.bit}&kisi=${kisi}`} download className="rounded px-1 text-sm underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">CSV indir</a></div>
          {events.events.length === 0 ? <p className="p-4 text-sm text-muted">Bu aralıkta olay yok.</p> : (
            <table className="mt-2 w-full min-w-[760px] text-sm">
              <thead className={TABLE_HEAD}><tr>{["Zaman", "Tür", "İçerik", "Tutar", "Onaylayan", "Gerekçe"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{events.events.map((e, i) => (
                <tr key={i}><td className="px-4 py-2.5 whitespace-nowrap">{dt(e.at)}</td><td className="px-4 py-2.5">{EVENT_LABEL[e.kind]}</td><td className="px-4 py-2.5">{e.text}</td><td className="px-4 py-2.5 tabular-nums">{e.amount === null ? "—" : money(e.amount)}</td><td className="px-4 py-2.5">{e.approvedBy ? events.names.get(e.approvedBy) ?? "Bilinmeyen" : "—"}</td><td className="px-4 py-2.5 text-muted">{e.reason ?? "—"}</td></tr>
              ))}</tbody>
            </table>
          )}
          {events.events.length === 500 && <p className="p-4 text-xs text-muted">İlk 500 olay gösteriliyor; tamamı için aralığı daralt.</p>}
        </Card>
      )}
    </div>
  );
}
