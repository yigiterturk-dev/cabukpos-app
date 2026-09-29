import Link from "next/link";
import { presets, type Range, type ReportTab } from "@/lib/core/report";

const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
export const reportHref = (sekme: ReportTab, r?: Range, extra: Record<string, string | undefined> = {}) => `/yonetim/raporlar?${qs({ sekme, bas: r?.bas, bit: r?.bit, ...extra })}`;

/** Tarih aralığı: hazır aralıklar (bağlantı) + başlangıç/bitiş + CSV. */
export function RangeBar({ sekme, range, csv, extra = {} }: { sekme: ReportTab; range: Range; csv: string | null; extra?: Record<string, string | undefined> }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
      <div className="flex flex-wrap gap-1" aria-label="Hazır aralık">
        {presets().map((p) => {
          const on = p.bas === range.bas && p.bit === range.bit;
          return <Link key={p.key} href={reportHref(sekme, p, extra)} aria-current={on ? "true" : undefined} className={`rounded-lg border px-3 py-2 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{p.label}</Link>;
        })}
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="sekme" value={sekme} />
        {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex flex-col gap-1">Başlangıç<input type="date" name="bas" defaultValue={range.bas} className="rounded-lg border border-line px-3 py-2" /></label>
        <label className="flex flex-col gap-1">Bitiş<input type="date" name="bit" defaultValue={range.bit} className="rounded-lg border border-line px-3 py-2" /></label>
        <button className="rounded-lg border border-line px-3 py-2 hover:bg-surface-2">Göster</button>
      </form>
      {csv && <a href={`/yonetim/raporlar/csv?${qs({ sekme: csv, bas: range.bas, bit: range.bit, ...extra })}`} download className="ml-auto rounded-lg border border-line px-3 py-2 hover:bg-surface-2">CSV indir</a>}
    </div>
  );
}
