"use client";
// Masa hesabı: tümü / eşit N / ürün seçerek. Her parça ayrı satış (kendi fiş no'su), mevcut ödeme penceresiyle.
import { useState } from "react";
import { totals } from "@/lib/core/cart";
import { formatTL } from "@/lib/core/money";
import { optionsText } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import { equalPart, payableLines, pickPart, type PayLine } from "@/lib/core/split";
import type { TabState } from "@/lib/core/tab";
import { PayDialog, type PayResult } from "./SaleScreen";
import type { Buyer } from "@/lib/core/fiscal";
import type { Payment } from "@/lib/core/payment";

type Mode = "tumu" | "esit" | "sec";
export type OnTabPay = (part: PayLine[], saleId: string, payments: Payment[], buyer: Buyer | null, tip: number) => Promise<PayResult>;

export function BillScreen({ tab, tableName, onPay, onReceipt, onBack }: { tab: TabState; tableName: string; onPay: OnTabPay; onReceipt: (saleId: string) => void; onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("tumu");
  const [parts, setParts] = useState(2);
  const [done, setDone] = useState(0); // eşit bölmede ödenen parça
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<{ saleId: string; receiptNo: string; change: number }[]>([]);
  const lines = payableLines(tab);
  const part = mode === "tumu" ? lines : mode === "esit" ? equalPart(lines, Math.max(1, parts - done)) : pickPart(lines, picks);
  const t = totals(part);
  const bump = (l: PayLine, d: number) => setPicks((p) => ({ ...p, [l.lineId]: Math.min(l.qtyMilli, Math.max(0, (p[l.lineId] ?? 0) + d)) }));

  if (tab.closed) {
    return (
      <div className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <h2 className="text-2xl font-semibold tracking-tight">{tableName} kapandı</h2>
        <ul className="my-4 space-y-1 text-sm">{paid.map((p) => <li key={p.saleId}><button type="button" onClick={() => onReceipt(p.saleId)} className="font-medium text-brand underline">{p.receiptNo}</button>{p.change > 0 && ` · para üstü ${formatTL(p.change)}`}</li>)}</ul>
        <button type="button" onClick={onBack} className="press rounded-xl bg-brand px-6 py-3 font-semibold text-white shadow-card hover:bg-brand-hover">Salona dön</button>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={onBack} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 -ml-2">← Adisyon</button>
        <h2 className="text-xl font-semibold tracking-tight">{tableName} · Hesap</h2>
        <span className="tabular ml-auto text-lg font-semibold">Kalan {formatTL(tab.remaining)}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Bölme">
        {([["tumu", "Tümü"], ["esit", "Eşit böl"], ["sec", "Ürün seç"]] as const).map(([m, l]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setDone(0); setPicks({}); }} className={`press min-h-11 rounded-[10px] border px-4 text-sm ${mode === m ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>{l}</button>
        ))}
        {mode === "esit" && (
          <span className="ml-2 flex items-center gap-2 text-sm">
            <button type="button" aria-label="Kişi azalt" disabled={done > 0} onClick={() => setParts((n) => Math.max(2, n - 1))} className="press grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium hover:bg-surface-3 disabled:opacity-40">−</button>
            <span className="tabular w-16 text-center" data-testid="split-count">{parts} kişi</span>
            <button type="button" aria-label="Kişi artır" disabled={done > 0} onClick={() => setParts((n) => Math.min(20, n + 1))} className="press grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium hover:bg-surface-3 disabled:opacity-40">+</button>
            <span className="text-muted">parça {done + 1}/{parts}</span>
          </span>
        )}
      </div>
      <ul className="mb-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {(mode === "sec" ? lines : part).map((l) => {
          const q = mode === "sec" ? picks[l.lineId] ?? 0 : l.qtyMilli;
          return (
            <li key={l.lineId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1">{l.name}{l.options.length > 0 && <span className="block text-xs text-muted">{optionsText(l.options)}</span>}</span>
              {mode === "sec" ? (
                <span className="flex items-center gap-2">
                  <button type="button" aria-label={`${l.name} azalt`} onClick={() => bump(l, -1000)} className="press grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium hover:bg-surface-3 disabled:opacity-40">−</button>
                  <span className="tabular w-14 text-center">{qtyText(q)} / {qtyText(l.qtyMilli)}</span>
                  <button type="button" aria-label={`${l.name} artır`} onClick={() => bump(l, l.qtyMilli - q < 1000 ? l.qtyMilli - q : 1000)} className="press grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium hover:bg-surface-3 disabled:opacity-40">+</button>
                </span>
              ) : <span className="tabular text-sm text-muted">{qtyText(q)}×</span>}
              <span className="tabular w-24 text-right">{formatTL(Math.round((l.unitPrice * q) / 1000))}</span>
            </li>
          );
        })}
      </ul>
      {part.some((l) => l.discount > 0) && <p className="mb-2 text-right text-sm">İndirim −{formatTL(part.reduce((a, l) => a + l.discount, 0))}</p>}
      <button type="button" disabled={t.total <= 0} onClick={() => setPaying(true)} className="press h-16 w-full rounded-2xl bg-brand text-xl font-semibold text-white shadow-card hover:bg-brand-hover disabled:opacity-40">Öde {formatTL(t.total)}</button>
      {paid.length > 0 && <p className="mt-3 text-center text-sm text-muted">Ödenen: {paid.map((p) => p.receiptNo).join(", ")}</p>}
      {paying && (
        <PayDialog total={t.total} onPay={(id, p, b, tip) => onPay(part, id, p, b, tip)} onClose={() => setPaying(false)}
          onDone={(r) => { setPaying(false); setPaid((x) => [...x, r]); setPicks({}); if (mode === "esit") setDone((n) => n + 1); }} />
      )}
    </div>
  );
}
