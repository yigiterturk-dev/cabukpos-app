// Vardiya (gün sonu) raporu — kasa gün sonu ve yönetim raporlarında aynı görünüm.
import { formatReceipt, type Currency } from "@/lib/core/money";
import { shownMethods } from "@/lib/core/payment";
import type { summarizeShift } from "@/lib/core/shift";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

/** Bulutta (yönetim) loadShiftSummary, kasada yerel satışlardan üretilir. */
export type ShiftReportData = {
  shift: { openingCash: number; openedAt: Date; closedAt: Date | null; countedCash: number | null; expectedCash: number | null };
  summary: ReturnType<typeof summarizeShift>;
  openedByName: string;
  closedByName: string;
  sales: { id: string; receiptNo: string; createdAt: Date; total: number }[];
  fiscalErrors?: number; // M8: vardiyada kesilemeyen e-Arşiv (0/undefined → gösterilmez)
  currency?: Currency; // #16: kasada cihazdan; bulutta/TRY'de yok → ₺
};

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const tm = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
export const signedTL = (k: number, c?: Currency) => `${k < 0 ? "-" : k > 0 ? "+" : ""}${formatReceipt(Math.abs(k), c)}`;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad" }) {
  const c = tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "";
  return (
    <div className={`flex items-start justify-between gap-4 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <span className="min-w-0 break-words">{label}</span>
      <span className={`shrink-0 whitespace-nowrap text-right tabular-nums ${c}`}>{value}</span>
    </div>
  );
}

export function ShiftReport({ data, deviceName, showSales = false }: { data: ShiftReportData; deviceName?: string; showSales?: boolean }) {
  const { shift, summary: s } = data;
  const TL = (k: number) => formatReceipt(k, data.currency); // #16
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
        <h2 className="mb-1 font-display text-base font-bold tracking-tight">Satışlar</h2>
        <div className="divide-y divide-line border-y border-line">
          <Row label="Satış sayısı" value={`${s.saleCount} satış`} />
          {data.fiscalErrors ? <Row label="Kesilemeyen e-Arşiv" value={`${data.fiscalErrors} belge`} tone="bad" /> : null}
          {s.refundCount > 0 && <Row label="İade" value={`${s.refundCount} iade · -${TL(s.refundTotal)}`} tone="bad" />}
          <Row label={s.refundCount > 0 ? "Ciro (iadeler düşülmüş)" : "Ciro (KDV dahil)"} value={TL(s.gross)} strong />
          {shownMethods(s.byMethod).map((m) => (
            <Row key={m.value} label={m.value === "nakit" ? (s.refundCount > 0 ? "Nakit (para üstü ve iade düşülmüş)" : "Nakit (para üstü düşülmüş)") : m.label} value={TL(s.byMethod[m.value])} />
          ))}
        </div>
      </section>
      {s.vat.length > 0 && (
        <section>
          <h2 className="mb-1 font-display text-base font-bold tracking-tight">KDV</h2>
          <HorizontalScrollRegion label="KDV dağılımı tablosu, yatay kaydırılabilir">
          <table aria-label="KDV dağılımı" className="w-full border-y border-line">
            <thead className="text-left text-xs text-muted"><tr><th scope="col" className="py-1.5 font-medium">Oran</th><th scope="col" className="text-right font-medium">Matrah</th><th scope="col" className="text-right font-medium">KDV</th><th scope="col" className="text-right font-medium">Toplam</th></tr></thead>
            <tbody className="tabular-nums">
              {s.vat.map((v) => <tr key={v.rate} className="border-t border-line"><td className="py-1.5">%{v.rate}</td><td className="text-right">{TL(v.net)}</td><td className="text-right">{TL(v.vat)}</td><td className="text-right">{TL(v.gross)}</td></tr>)}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </section>
      )}
      <section>
        <h2 className="mb-1 font-display text-base font-bold tracking-tight">Kasa</h2>
        <div className="divide-y divide-line border-y border-line">
          <Row label="Açılış nakdi" value={TL(shift.openingCash)} />
          {s.dropped > 0 && <Row label="Güvenli kasaya aktarılan" value={`-${TL(s.dropped)}`} />}
          <Row label="Beklenen kasa" value={TL(expected)} strong />
          {shift.countedCash !== null && <Row label="Sayılan nakit" value={TL(shift.countedCash)} />}
          {diff !== null && <Row label="Fark" value={signedTL(diff, data.currency)} strong tone={diff < 0 ? "bad" : diff > 0 ? "ok" : undefined} />}
        </div>
      </section>
      {showSales && data.sales.length > 0 && (
        <section>
          <h2 className="mb-1 font-display text-base font-bold tracking-tight">Fişler</h2>
          <div className="divide-y divide-line border-y border-line">
            {data.sales.map((x) => <Row key={x.id} label={`${x.receiptNo} · ${tm(x.createdAt)}`} value={TL(x.total)} />)}
          </div>
        </section>
      )}
    </div>
  );
}
