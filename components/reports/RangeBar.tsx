import Link from "next/link";
import { dateRanges, type Range, type ReportTab } from "@/lib/core/report";
import { PrintButton } from "@/components/admin/ReportMailCard";
import { buttonClass } from "@/components/ui";

const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
export const reportHref = (sekme: ReportTab, r?: Range, extra: Record<string, string | undefined> = {}) => `/yonetim/raporlar?${qs({ sekme, bas: r?.bas, bit: r?.bit, ...extra })}`;

/** Tarih aralığı: hazır aralıklar (bağlantı) + başlangıç/bitiş + CSV + Yazdır/PDF. */
export function RangeBar({ sekme, range, csv, print = false, extra = {} }: { sekme: ReportTab; range: Range; csv: string | null; print?: boolean; extra?: Record<string, string | undefined> }) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface-2/95 p-3 text-sm shadow-card backdrop-blur-sm lg:sticky lg:top-[4.5rem] lg:z-20 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between" aria-label="Rapor tarih aralığı">
      <div className="min-w-0 lg:flex-1">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Hazır aralıklar</div>
        <div className="flex flex-wrap gap-1" aria-label="Hazır aralık">
          {dateRanges().map((p) => {
            const on = p.bas === range.bas && p.bit === range.bit;
            return <Link key={p.key} href={reportHref(sekme, p, extra)} aria-current={on ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>{p.label}</Link>;
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:ml-auto lg:shrink-0 lg:flex-row lg:items-end">
        <form className="flex min-w-0 flex-wrap items-end gap-2">
          <input type="hidden" name="sekme" value={sekme} />
          {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Başlangıç</span><input type="date" name="bas" defaultValue={range.bas} className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Bitiş</span><input type="date" name="bit" defaultValue={range.bit} className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <button type="submit" className={buttonClass("primary")}>Göster</button>
        </form>
        <span className="flex flex-wrap items-center gap-2">
          {print && <PrintButton />}
          {csv && <a href={`/yonetim/raporlar/csv?${qs({ sekme: csv, bas: range.bas, bit: range.bit, ...extra })}`} download className={buttonClass("secondary")}>CSV indir</a>}
        </span>
      </div>
    </div>
  );
}
