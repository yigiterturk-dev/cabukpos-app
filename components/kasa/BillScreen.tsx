"use client";
// Masa hesabı: tümü / eşit N / ürün seçerek. Her parça ayrı satış (kendi fiş no'su), mevcut ödeme penceresiyle.
import { useEffect, useRef, useState } from "react";
import { totals } from "@/lib/core/cart";
import type { Currency } from "@/lib/core/money";
import { kasaFmt } from "./kasa-format";
import { optionsText } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import { equalPart, payableLines, pickPart, type PayLine } from "@/lib/core/split";
import type { TabState } from "@/lib/core/tab";
import { PayDialog, type PayResult } from "./SaleScreen";
import type { Buyer } from "@/lib/core/fiscal";
import type { Payment } from "@/lib/core/payment";
import type { SaleExtrasInput } from "@/lib/loyalty";

type Mode = "tumu" | "esit" | "sec";
export type OnTabPay = (part: PayLine[], saleId: string, payments: Payment[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => Promise<PayResult>;

export function BillScreen({ tab, tableName, onPay, onReceipt, onBack, currency }: { tab: TabState; tableName: string; onPay: OnTabPay; onReceipt: (saleId: string) => void; onBack: () => void; currency?: Currency }) {
  const { TL } = kasaFmt({ device: { currency } });
  const [mode, setMode] = useState<Mode>("tumu");
  const [parts, setParts] = useState(2);
  const [done, setDone] = useState(0); // eşit bölmede ödenen parça
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<{ saleId: string; receiptNo: string; change: number }[]>([]);
  const closedHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!tab.closed) return;
    const frame = requestAnimationFrame(() => closedHeadingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [tab.closed]);
  const lines = payableLines(tab);
  const part = mode === "tumu" ? lines : mode === "esit" ? equalPart(lines, Math.max(1, parts - done)) : pickPart(lines, picks);
  const t = totals(part);
  const bump = (l: PayLine, d: number) => setPicks((p) => ({ ...p, [l.lineId]: Math.min(l.qtyMilli, Math.max(0, (p[l.lineId] ?? 0) + d)) }));

  if (tab.closed) {
    return (
      <div id="kasa-content" role="main" tabIndex={-1} className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card outline-none">
        <h2 ref={closedHeadingRef} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{tableName} kapandı</h2>
        <ul className="my-4 break-words space-y-1 text-sm">{paid.map((p) => <li key={p.saleId}><button type="button" onClick={() => onReceipt(p.saleId)} className="inline-flex min-h-12 items-center rounded px-1 font-medium text-brand underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{p.receiptNo}</button>{p.change > 0 && ` · para üstü ${TL(p.change)}`}</li>)}</ul>
        <button type="button" onClick={onBack} className="press inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-action px-6 py-3 font-semibold text-white shadow-card outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60">Salona dön</button>
      </div>
    );
  }
  return (
    <div id="kasa-content" role="main" tabIndex={-1} className="mx-auto w-full max-w-2xl p-4 outline-none">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="press inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 -ml-2">← Adisyon</button>
        <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight" title={`${tableName} · Hesap`}>{tableName} · Hesap</h2>
        <span className="tabular order-last basis-full text-right text-lg font-semibold sm:order-none sm:ml-auto sm:basis-auto">Kalan {TL(tab.remaining)}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Bölme">
        {([["tumu", "Tümü"], ["esit", "Eşit böl"], ["sec", "Ürün seç"]] as const).map(([m, l]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setDone(0); setPicks({}); }} className={`press min-h-12 rounded-[10px] border px-4 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${mode === m ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>{l}</button>
        ))}
        {mode === "esit" && (
          <span className="ml-2 flex items-center gap-2 text-sm">
            <button type="button" aria-label="Kişi azalt" disabled={done > 0} onClick={() => setParts((n) => Math.max(2, n - 1))} className="press grid size-12 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40">−</button>
            <span className="tabular w-16 text-center" data-testid="split-count">{parts} kişi</span>
            <button type="button" aria-label="Kişi artır" disabled={done > 0} onClick={() => setParts((n) => Math.min(20, n + 1))} className="press grid size-12 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40">+</button>
            <span className="text-muted">parça {done + 1}/{parts}</span>
          </span>
        )}
      </div>
      <ul className="mb-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {(mode === "sec" ? lines : part).map((l) => {
          const q = mode === "sec" ? picks[l.lineId] ?? 0 : l.qtyMilli;
          return (
            <li key={l.lineId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 basis-full flex-1 break-words sm:basis-auto">{l.name}{l.options.length > 0 && <span className="block break-words text-xs text-muted">{optionsText(l.options)}</span>}</span>
              {mode === "sec" ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" aria-label={`${l.name} azalt`} disabled={q <= 0} onClick={() => bump(l, -1000)} className="press grid size-12 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">−</button>
                  <span className="tabular w-14 text-center">{qtyText(q)} / {qtyText(l.qtyMilli)}</span>
                  <button type="button" aria-label={`${l.name} artır`} disabled={q >= l.qtyMilli} onClick={() => bump(l, l.qtyMilli - q < 1000 ? l.qtyMilli - q : 1000)} className="press grid size-12 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">+</button>
                </span>
              ) : <span className="tabular shrink-0 text-sm text-muted">{qtyText(q)}×</span>}
              <span className="tabular w-24 shrink-0 text-right">{TL(Math.round((l.unitPrice * q) / 1000))}</span>
            </li>
          );
        })}
      </ul>
      {part.some((l) => l.discount > 0) && <p className="mb-2 text-right text-sm">İndirim −{TL(part.reduce((a, l) => a + l.discount, 0))}</p>}
      <button type="button" disabled={t.total <= 0} onClick={() => setPaying(true)} className="press h-16 w-full rounded-2xl bg-brand-action text-xl font-semibold text-white shadow-card outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">Öde {TL(t.total)}</button>
      {paid.length > 0 && <p className="mt-3 break-words text-center text-sm text-muted" role="status" aria-live="polite" aria-atomic="true">Ödeme kaydedildi. Fiş: {paid.map((p) => p.receiptNo).join(", ")}.</p>}
      {paying && (
        <PayDialog total={t.total} currency={currency} onPay={(id, p, b, tip, ex) => onPay(part, id, p, b, tip, ex)} onClose={() => setPaying(false)}
          onDone={(r) => { setPaying(false); setPaid((x) => [...x, r]); setPicks({}); if (mode === "esit") setDone((n) => n + 1); }} />
      )}
    </div>
  );
}
