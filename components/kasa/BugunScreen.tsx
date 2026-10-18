"use client";
// "Bugün" özet ekranı: vardiyanın canlı özeti (ciro, satış, açık adisyon, hazır bekleyen) + hızlı geçiş karoları.
// Gating değildir: kasada varsayılan ekran hâlâ satış/salon; burası isteğe bağlı bir segment.
import { useEffect, useRef, useState } from "react";
import { kasaFmt } from "./kasa-format";
import { summarizeShift } from "@/lib/core/shift";
import { shownMethods } from "@/lib/core/payment";
import { shiftSales } from "@/lib/offline/db";
import { deliveryStatus, type TabState } from "@/lib/core/tab";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { StatCard } from "@/components/ui";
import { ArrowRight, Bike, ChefHat, LayoutGrid, Receipt, ShoppingBasket, Users, Wallet, Zap } from "lucide-react";

type Summary = ReturnType<typeof summarizeShift>;

export function BugunScreen({ meta, tabs, hasSalon, hasPaket, onGoSale, onGoSalon, onGoPaket }: {
  meta: Meta; tabs: Map<string, TabState>;
  hasSalon: boolean; hasPaket: boolean;
  onGoSale: () => void; onGoSalon: () => void; onGoPaket: () => void;
}) {
  const { TL } = kasaFmt(meta);
  const shift = meta.shift;
  const [loaded, setLoaded] = useState<{ shiftId: string; sum: Summary; sales: LocalSale[] } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!shift) return;
    let alive = true;
    void shiftSales(shift.id).then((s) => {
      if (!alive) return;
      setLoaded({ shiftId: shift.id, sales: s, sum: summarizeShift(shift.openingCash, s, (meta.drops ?? []).map((d) => d.amount)) });
      setSummaryError(null);
    }).catch(() => { if (alive) setSummaryError(shift.id); });
    return () => { alive = false; };
  }, [shift, meta, summaryRetry]);

  const summary = shift && loaded?.shiftId === shift.id ? loaded : null;
  const hasSummaryError = !!shift && summaryError === shift.id;
  const paymentSummary = summary && shownMethods(summary.sum.byMethod)
    .filter((m) => summary.sum.byMethod[m.value] !== 0)
    .map((m) => `${m.label.toLocaleLowerCase("tr-TR")} ${TL(summary.sum.byMethod[m.value])}`)
    .join(" · ");
  const open = [...tabs.values()].filter((t) => !t.closed);
  const ready = open.reduce((a, t) => a + t.tickets.filter((k) => k.status === "hazir").length, 0);
  const waiting = open.filter((t) => t.kind === "platform" && deliveryStatus(t) === "onay_bekliyor").length;
  const recent = [...(summary?.sales ?? [])].reverse().slice(0, 5);
  const since = shift ? new Date(shift.openedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }) : "";

  return (
    <main id="kasa-content" tabIndex={-1} className="mx-auto min-w-0 w-full max-w-5xl px-4 py-6 outline-none">
      <div className="mb-5">
        <h1 ref={headingRef} tabIndex={-1} className="rounded-sm font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Bugün</h1>
        <p className="mt-1 text-sm text-muted">
          {meta.device?.tenantName} · {meta.device?.name}{shift && ` · vardiya ${since}'de açıldı`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ciro (KDV dahil)" value={summary ? TL(summary.sum.gross) : "—"} tone="brand" icon={<Wallet />} hint={summary && summary.sum.refundCount > 0 ? `${summary.sum.refundCount} iade düşülmüş` : undefined} />
        <StatCard label="Satış" value={summary ? `${summary.sum.saleCount}` : "—"} tone="ok" icon={<Receipt />} hint={paymentSummary ? `Ödemeler: ${paymentSummary}` : undefined} />
        <StatCard label="Açık adisyon" value={`${open.length}`} tone="info" icon={<Users />} hint={waiting > 0 ? `${waiting} onay bekliyor` : undefined} />
        <StatCard label="Hazır bekleyen" value={`${ready}`} tone={ready > 0 ? "warn" : "neutral"} icon={<ChefHat />} />
      </div>
      {hasSummaryError ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm text-warn" role="alert">
        <span>Vardiya özeti bu cihazdan okunamadı.</span>
        <button type="button" onClick={() => { setSummaryError(null); setSummaryRetry((n) => n + 1); requestAnimationFrame(() => headingRef.current?.focus()); }} className="inline-flex min-h-11 items-center rounded-lg border border-warn/30 bg-surface px-3 font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yeniden yükle</button>
      </div> : shift && !summary && <p className="sr-only" role="status" aria-live="polite">Vardiya özeti yükleniyor.</p>}

      <h2 className="mb-3 mt-7 font-display text-base font-bold tracking-tight">Hızlı geçiş</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" data-testid="today-go-sale" onClick={onGoSale} className="press flex min-h-16 items-center gap-3 rounded-xl border border-brand bg-brand-soft px-4 text-left outline-none hover:border-brand hover:shadow-rest focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          <Zap aria-hidden className="size-5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Hızlı satış</span><span className="block truncate text-xs text-muted">Barkod okut ya da ürün seç</span></span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-brand" />
        </button>
        {hasSalon && <button type="button" data-testid="today-go-salon" onClick={onGoSalon} className="press flex min-h-16 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left outline-none hover:border-line-strong hover:shadow-rest focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          <LayoutGrid aria-hidden className="size-5 shrink-0 text-ink-2" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Salon</span><span className="block truncate text-xs text-muted">Masa ve adisyonları yönet</span></span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
        </button>}
        {hasPaket && <button type="button" data-testid="today-go-paket" onClick={onGoPaket} className="press flex min-h-16 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left outline-none hover:border-line-strong hover:shadow-rest focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          <Bike aria-hidden className="size-5 shrink-0 text-ink-2" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Paket</span><span className="block truncate text-xs text-muted">Paket ve platform siparişleri</span></span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
        </button>}
      </div>

      {recent.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 font-display text-lg font-bold tracking-tight">Son fişler</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-rest">
            {recent.map((s) => (
              <li key={s.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm">
                <ShoppingBasket aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="shrink-0 tabular font-medium">{s.receiptNo}</span>
                <span className="shrink-0 text-muted">{new Date(s.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}</span>
                {s.refund && <span className="shrink-0 rounded bg-bad-soft px-1.5 text-xs font-medium text-bad">iade</span>}
                <span className="ml-auto shrink-0 tabular font-semibold">{TL(s.refund ? -(s.total - (s.discount ?? 0)) : s.total - (s.discount ?? 0))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-xs text-muted">Özet cihazda canlı güncellenir; bulut eşitlenince raporlara da yansır.</p>
    </main>
  );
}
