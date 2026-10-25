"use client";
// Masa hesabı: tümü / eşit N / ürün seçerek. Her parça ayrı satış (kendi fiş no'su), mevcut ödeme penceresiyle.
import { useEffect, useRef, useState } from "react";
import { totals } from "@/lib/core/cart";
import type { Currency } from "@/lib/core/money";
import { kasaFmt } from "./kasa-format";
import { optionsText } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import { equalPart, lineShare, payableLines, pickPart, type PayLine } from "@/lib/core/split";
import type { TabState } from "@/lib/core/tab";
import { PayDialog, type PayResult } from "./SaleScreen";
import type { Buyer } from "@/lib/core/fiscal";
import type { Payment } from "@/lib/core/payment";
import type { SaleExtrasInput } from "@/lib/loyalty";
import { useKasaMainProps } from "./KasaPreviewContext";

type Mode = "tumu" | "esit" | "sec";
export type OnTabPay = (part: PayLine[], saleId: string, payments: Payment[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => Promise<PayResult>;

export function BillScreen({ tab, tableName, onPay, onReceipt, onBack, currency }: { tab: TabState; tableName: string; onPay: OnTabPay; onReceipt: (saleId: string) => void; onBack: () => void; currency?: Currency }) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt({ device: { currency } });
  const [mode, setMode] = useState<Mode>("tumu");
  const [parts, setParts] = useState(2);
  const [done, setDone] = useState(0); // eşit bölmede ödenen parça
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [shareParts, setShareParts] = useState<Record<string, number>>({});
  const [shareSelections, setShareSelections] = useState<Record<string, number>>({});
  const [shareError, setShareError] = useState("");
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
  const clearShareSelection = (id: string) => setShareSelections(old => { const next = { ...old }; delete next[id]; return next; });
  const bump = (l: PayLine, d: number) => { setShareError(""); clearShareSelection(l.lineId); setPicks((p) => ({ ...p, [l.lineId]: Math.min(l.qtyMilli, Math.max(0, (p[l.lineId] ?? 0) + d)) })); };

  if (tab.closed) {
    return (
      <div {...mainProps} className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card outline-none">
        <h2 ref={closedHeadingRef} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{tableName} kapandı</h2>
        <ul className="my-4 break-words space-y-1 text-sm">{paid.map((p) => <li key={p.saleId}><button type="button" onClick={() => onReceipt(p.saleId)} className="inline-flex min-h-12 items-center rounded px-1 font-medium text-brand underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{p.receiptNo}</button>{p.change > 0 && ` · para üstü ${TL(p.change)}`}</li>)}</ul>
        <button type="button" onClick={onBack} className="press inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-action px-6 py-3 font-semibold text-white shadow-card outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60">{tab.kind === "masa" ? "Salona dön" : "Paketlere dön"}</button>
      </div>
    );
  }
  return (
    <div {...mainProps} className="mx-auto w-full max-w-2xl p-4 outline-none">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="press inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 -ml-2">← Adisyon</button>
        <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight" title={`${tableName} · Hesap`}>{tableName} · Hesap</h2>
        <span className="tabular order-last basis-full text-right text-lg font-semibold sm:order-none sm:ml-auto sm:basis-auto">Kalan {TL(tab.remaining)}</span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Bölme">
        {([["tumu", "Hesabın tamamı"], ["esit", "Kişi sayısına böl"], ["sec", "Ürün seçerek öde"]] as const).map(([m, l]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setDone(0); setPicks({}); setShareSelections({}); setShareError(""); }} className={`press min-h-12 rounded-[10px] border px-4 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${mode === m ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>{l}</button>
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
      {tab.kind === "paket" && tab.delivery.deliveredAt && <p className="mb-4 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm text-warn">Teslim edilmiş siparişin kalan hesabı tahsil edilir. Teslim durumu korunur; ödeme bu kasanın açık vardiyasına kaydedilir.</p>}
      <p className="mb-4 text-sm text-muted">{mode === "tumu" ? "Ödeme ekranında nakit ve kartı birlikte kullanabilirsiniz. Hesabı ayrı ayrı almak için kişi sayısına bölün veya ürün seçin." : mode === "esit" ? "Her kişinin payını ayrı nakit, kart veya karma ödeme ile alın. Kalan hesap masada açık kalır." : "Ödenecek ürünleri + ile seçin. Yalnız seçilen ürünler tahsil edilir; diğerleri masada açık kalır."}</p>
      <ul className="mb-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {(mode === "sec" ? lines : part).map((l) => {
          const q = mode === "sec" ? picks[l.lineId] ?? 0 : l.qtyMilli;
          const lineLabel = [l.name, l.options.length > 0 ? optionsText(l.options) : null, l.note ? `Not: ${l.note}` : null].filter(Boolean).join(", ");
          return (
            <li key={l.lineId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 basis-full flex-1 break-words sm:basis-auto"><span>{l.name}</span>{l.options.length > 0 && <span className="block break-words text-xs text-muted">{optionsText(l.options)}</span>}{l.note && <span className="block break-words text-xs font-medium text-warn">Not: {l.note}</span>}</span>
              {mode === "sec" ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" aria-label={`${lineLabel} azalt`} disabled={q <= 0} onClick={() => bump(l, -1000)} className="press grid size-12 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">−</button>
                  <span className="tabular w-14 text-center">{qtyText(q)} / {qtyText(l.qtyMilli)}</span>
                  <button type="button" aria-label={`${lineLabel} artır`} disabled={q >= l.qtyMilli} onClick={() => bump(l, l.qtyMilli - q < 1000 ? l.qtyMilli - q : 1000)} className="press grid size-12 place-items-center rounded-[10px] border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">+</button>
                </span>
              ) : <span className="tabular shrink-0 text-sm text-muted">{qtyText(q)}×</span>}
              <span className="tabular w-24 shrink-0 text-right">{TL(Math.round((l.unitPrice * q) / 1000))}</span>
              {mode === "sec" && l.qtyMilli > 1 && totals([l]).total > 0 && <div className="flex basis-full flex-wrap items-center gap-2 border-t border-line pt-2 text-xs text-muted">
                <label className="flex items-center gap-2">Kalan ürünü<select aria-label={`${lineLabel} paylaşım sayısı`} value={shareParts[l.lineId] ?? 2} onChange={e => { clearShareSelection(l.lineId); setShareParts(p => ({ ...p, [l.lineId]: Number(e.target.value) })); }} className="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "Son pay" : `${n} paya böl`}</option>)}</select></label>
                <button type="button" aria-label={`${lineLabel} için bir pay seç`} onClick={() => { const count = shareParts[l.lineId] ?? 2; const share = lineShare(l, count); if (!share || totals([share]).total <= 0) { setShareError("Bu ürün bu sayıda ücretli paya bölünemiyor. Daha az pay seçin."); return; } setShareError(""); setPicks(p => ({ ...p, [l.lineId]: share.qtyMilli })); setShareSelections(p => ({ ...p, [l.lineId]: count })); }} className="press min-h-11 rounded-lg border border-brand bg-brand-soft px-3 text-sm font-medium text-brand outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Bir pay seç</button>
                <button type="button" aria-label={`${lineLabel} kalanının tamamını seç`} onClick={() => { setShareError(""); clearShareSelection(l.lineId); setPicks(p => ({ ...p, [l.lineId]: l.qtyMilli })); }} className="press min-h-11 rounded-lg px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Kalanın tamamı</button>
              </div>}
            </li>
          );
        })}
      </ul>
      {shareError && <p role="alert" className="mb-3 rounded-xl bg-warn-soft p-3 text-sm text-warn">{shareError}</p>}
      {mode === "sec" && <p className="mb-3 text-xs text-muted">Tek bir ürünü de paylaşabilirsiniz. “Bir pay seç” yalnız kalan miktardan pay alır. Miktar hassasiyeti nedeniyle paylar arasında yuvarlama farkı olabilir; hesabın toplamı korunur.</p>}
      {part.some((l) => l.discount > 0) && <p className="mb-2 text-right text-sm">İndirim −{TL(part.reduce((a, l) => a + l.discount, 0))}</p>}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{mode === "sec" ? `Seçilen kalemler için ödenecek tutar: ${TL(t.total)}.` : mode === "esit" ? `${parts} kişiye eşit bölme, ${done + 1}. parça: ${TL(t.total)}.` : ""}</p>
      <button type="button" disabled={t.total <= 0} onClick={() => setPaying(true)} className="press h-16 w-full rounded-2xl bg-brand-action text-xl font-semibold text-white shadow-card outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">Öde {TL(t.total)}</button>
      {paid.length > 0 && <p className="mt-3 break-words text-center text-sm text-muted" role="status" aria-live="polite" aria-atomic="true">Ödeme kaydedildi. Fiş: {paid.map((p) => p.receiptNo).join(", ")}.</p>}
      {paying && (
        <PayDialog total={t.total} currency={currency} onPay={(id, p, b, tip, ex) => onPay(part, id, p, b, tip, ex)} onClose={() => setPaying(false)}
          onDone={(r) => { setPaying(false); setPaid((x) => [...x, r]); setPicks({}); if (mode === "sec") setShareParts(old => ({ ...old, ...Object.fromEntries(Object.entries(shareSelections).map(([id, count]) => [id, Math.max(1, count - 1)])) })); setShareSelections({}); if (mode === "esit") setDone((n) => n + 1); }} />
      )}
    </div>
  );
}
