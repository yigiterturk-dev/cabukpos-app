// Vardiya (gün sonu) raporu — kasa gün sonu ve yönetim raporlarında aynı görünüm.
import { formatTL } from "@/lib/core/money";
import { shownMethods } from "@/lib/core/payment";
import type { summarizeShift } from "@/lib/core/shift";

/** Bulutta (yönetim) loadShiftSummary, kasada yerel satışlardan üretilir. */
export type ShiftReportData = {
  shift: { openingCash: number; openedAt: Date; closedAt: Date | null; countedCash: number | null; expectedCash: number | null };
  summary: ReturnType<typeof summarizeShift>;
  openedByName: string;
  closedByName: string;
  sales: { id: string; receiptNo: string; createdAt: Date; total: number }[];
};

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const tm = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
export const signedTL = (k: number) => `${k < 0 ? "-" : k > 0 ? "+" : ""}${formatTL(Math.abs(k))}`;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad" }) {
  const c = tone === "bad" ? "text-red-700" : tone === "ok" ? "text-emerald-700" : "";
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${c}`}>{value}</span>
    </div>
  );
}

export function ShiftReport({ data, deviceName, showSales = false }: { data: ShiftReportData; deviceName?: string; showSales?: boolean }) {
  const { shift, summary: s } = data;
  const expected = shift.expectedCash ?? s.expectedCash;
  const diff = shift.countedCash === null ? null : shift.countedCash - expected;
  return (
    <div className="space-y-5 text-sm">
      <div className="text-muted">
        {deviceName && <span className="font-medium text-ink">{deviceName} · </span>}
        Açan {data.openedByName}, {dt(shift.openedAt)}
        {shift.closedAt && <> · Kapatan {data.closedByName}, {dt(shift.closedAt)}</>}
      </div>
      <section>
        <h2 className="mb-1 font-semibold">Satışlar</h2>
        <div className="divide-y divide-line border-y border-line">
          <Row label="Satış sayısı" value={`${s.saleCount} satış`} />
          {s.refundCount > 0 && <Row label="İade" value={`${s.refundCount} iade · -${formatTL(s.refundTotal)}`} tone="bad" />}
          <Row label={s.refundCount > 0 ? "Ciro (iadeler düşülmüş)" : "Ciro (KDV dahil)"} value={formatTL(s.gross)} strong />
          {shownMethods(s.byMethod).map((m) => (
            <Row key={m.value} label={m.value === "nakit" ? (s.refundCount > 0 ? "Nakit (para üstü ve iade düşülmüş)" : "Nakit (para üstü düşülmüş)") : m.label} value={formatTL(s.byMethod[m.value])} />
          ))}
        </div>
      </section>
      {s.vat.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">KDV</h2>
          <table className="w-full border-y border-line">
            <thead className="text-left text-xs text-muted"><tr><th className="py-1.5 font-medium">Oran</th><th className="text-right font-medium">Matrah</th><th className="text-right font-medium">KDV</th><th className="text-right font-medium">Toplam</th></tr></thead>
            <tbody className="tabular-nums">
              {s.vat.map((v) => <tr key={v.rate} className="border-t border-line"><td className="py-1.5">%{v.rate}</td><td className="text-right">{formatTL(v.net)}</td><td className="text-right">{formatTL(v.vat)}</td><td className="text-right">{formatTL(v.gross)}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}
      <section>
        <h2 className="mb-1 font-semibold">Kasa</h2>
        <div className="divide-y divide-line border-y border-line">
          <Row label="Açılış nakdi" value={formatTL(shift.openingCash)} />
          <Row label="Beklenen kasa" value={formatTL(expected)} strong />
          {shift.countedCash !== null && <Row label="Sayılan nakit" value={formatTL(shift.countedCash)} />}
          {diff !== null && <Row label="Fark" value={signedTL(diff)} strong tone={diff < 0 ? "bad" : diff > 0 ? "ok" : undefined} />}
        </div>
      </section>
      {showSales && data.sales.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Fişler</h2>
          <div className="divide-y divide-line border-y border-line">
            {data.sales.map((x) => <Row key={x.id} label={`${x.receiptNo} · ${tm(x.createdAt)}`} value={formatTL(x.total)} />)}
          </div>
        </section>
      )}
    </div>
  );
}
