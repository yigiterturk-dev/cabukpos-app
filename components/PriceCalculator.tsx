"use client";
// #61 fiyatlandırma hesaplayıcı: şube + terminal sayısından dönem tutarı (saf planBreakdown).
import { useState } from "react";
import { planBreakdown, type BillingPeriod, type UnitPrices } from "@/lib/core/billing";
import { formatTL } from "@/lib/core/money";

export function PriceCalculator({ prices }: { prices: Record<BillingPeriod, UnitPrices | null> }) {
  const [period, setPeriod] = useState<BillingPeriod>("aylik");
  const [stores, setStores] = useState(1);
  const [devices, setDevices] = useState(1);
  const p = prices[period];
  const n = (v: string, max: number) => Math.min(max, Math.max(1, Math.floor(Number(v) || 1)));
  const bd = p ? planBreakdown(p, { stores, devices }) : null;
  return (
    <div className="rounded-2xl border border-line bg-white p-7 shadow-card">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Dönem">
        {([["aylik", "Aylık"], ["yillik", "Yıllık"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}
            className={`rounded-lg border px-4 py-2 text-sm ${period === k ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-5">
        <label className="text-sm"><span className="block text-xs text-muted">Şube</span>
          <input type="number" min={1} max={50} value={stores} onChange={(e) => setStores(n(e.target.value, 50))} className="mt-1 w-24 rounded-lg border border-line bg-surface px-3 py-2 tabular" />
        </label>
        <label className="text-sm"><span className="block text-xs text-muted">Kasa/terminal</span>
          <input type="number" min={1} max={200} value={devices} onChange={(e) => setDevices(n(e.target.value, 200))} className="mt-1 w-24 rounded-lg border border-line bg-surface px-3 py-2 tabular" />
        </label>
      </div>
      <div className="mt-6 border-t border-line pt-5">
        {bd ? (
          <>
            <div className="text-sm text-muted">Taban {formatTL(bd.base)}{bd.extraStores ? ` · ek şube ${formatTL(bd.extraStores)}` : ""}{bd.extraDevices ? ` · ek terminal ${formatTL(bd.extraDevices)}` : ""}</div>
            <div className="mt-1 flex items-baseline gap-2"><span data-testid="calc-total" className="text-4xl font-semibold tracking-tight tabular">{formatTL(bd.total)}</span><span className="text-sm text-muted">{period === "aylik" ? "/ ay" : "/ yıl, peşin"}</span></div>
            {period === "yillik" && <div className="mt-1 text-sm text-muted">Aylık karşılığı ≈ {formatTL(Math.round(bd.total / 12))}</div>}
          </>
        ) : (
          <div className="text-sm text-muted">Bu dönem için self servis fiyat kapalı; teklif için bize yazın.</div>
        )}
      </div>
    </div>
  );
}
