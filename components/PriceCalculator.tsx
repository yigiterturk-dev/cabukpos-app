"use client";
// #61 fiyatlandırma hesaplayıcı: şube + terminal sayısından dönem tutarı (saf planBreakdown).
import { useState } from "react";
import { planBreakdown, type BillingPeriod, type UnitPrices } from "@/lib/core/billing";
import { formatTL } from "@/lib/core/money";

export function PriceCalculator({ prices }: { prices: Record<BillingPeriod, UnitPrices | null> }) {
  const [period, setPeriod] = useState<BillingPeriod>("aylik");
  const [stores, setStores] = useState(1);
  const [devices, setDevices] = useState(1);
  const [storesInput, setStoresInput] = useState("1");
  const [devicesInput, setDevicesInput] = useState("1");
  const p = prices[period];
  const n = (v: string, max: number) => Math.min(max, Math.max(1, Math.floor(Number(v) || 1)));
  const editCount = (value: string, max: number, setText: (next: string) => void, setCount: (next: number) => void) => {
    if (!value) { setText(""); return; }
    const next = n(value, max);
    setText(String(next));
    setCount(next);
  };
  const finishCount = (value: string, max: number, setText: (next: string) => void, setCount: (next: number) => void) => {
    const next = n(value, max);
    setText(String(next));
    setCount(next);
  };
  const countsReady = storesInput !== "" && devicesInput !== "";
  const bd = p && countsReady ? planBreakdown(p, { stores, devices }) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-7 shadow-card">
      <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
        <legend className="sr-only">Dönem</legend>
        {([["aylik", "Aylık"], ["yillik", "Yıllık"]] as const).map(([k, l]) => (
          <label key={k} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/50 ${period === k ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>
            <input type="radio" name="billingPeriod" value={k} checked={period === k} onChange={() => setPeriod(k)} className="size-4 accent-[var(--color-brand)]" />
            <span>{l}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-5">
        <label className="text-sm"><span className="block text-xs text-muted">Şube</span>
          <input type="number" inputMode="numeric" min={1} max={50} value={storesInput} onChange={(e) => editCount(e.target.value, 50, setStoresInput, setStores)} onBlur={() => finishCount(storesInput, 50, setStoresInput, setStores)} aria-invalid={storesInput === "" || undefined} aria-describedby={storesInput === "" ? "price-calculator-count-error" : undefined} className={`mt-1 min-h-11 w-24 rounded-lg border bg-surface px-3 py-2 text-base tabular outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50 lg:text-sm ${storesInput === "" ? "border-bad focus:border-bad focus:ring-bad/30" : "border-line"}`} />
        </label>
        <label className="text-sm"><span className="block text-xs text-muted">Kasa/terminal</span>
          <input type="number" inputMode="numeric" min={1} max={200} value={devicesInput} onChange={(e) => editCount(e.target.value, 200, setDevicesInput, setDevices)} onBlur={() => finishCount(devicesInput, 200, setDevicesInput, setDevices)} aria-invalid={devicesInput === "" || undefined} aria-describedby={devicesInput === "" ? "price-calculator-count-error" : undefined} className={`mt-1 min-h-11 w-24 rounded-lg border bg-surface px-3 py-2 text-base tabular outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50 lg:text-sm ${devicesInput === "" ? "border-bad focus:border-bad focus:ring-bad/30" : "border-line"}`} />
        </label>
      </div>
      <div aria-live="polite" aria-atomic="true" className="mt-6 border-t border-line pt-5">
        {!countsReady ? (
          <p id="price-calculator-count-error" className="text-sm text-warn" role="status">Hesaplama için şube ve kasa/terminal sayısını girin; her değer en az 1 olmalı.</p>
        ) : bd ? (
          <>
            <div className="text-sm text-muted">
              Taban {formatTL(bd.base)}
              {bd.extraStores ? ` · ek şube ${formatTL(bd.extraStores)}` : stores > 1 && !p?.store ? ` · ${stores - 1} ek şube ücretsiz` : ""}
              {bd.extraDevices ? ` · ek terminal ${formatTL(bd.extraDevices)}` : devices > 1 && !p?.device ? ` · ${devices - 1} ek terminal ücretsiz` : ""}
            </div>
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
