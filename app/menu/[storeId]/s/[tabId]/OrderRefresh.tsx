"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function OrderRefresh({ closed }: { closed: boolean }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [manualStatus, setManualStatus] = useState("");
  const manualRef = useRef(false);

  const refresh = useCallback((manual = false) => {
    if (refreshing) return;
    if (manual) {
      manualRef.current = true;
      setManualStatus("Sipariş durumu güncelleniyor.");
    }
    startRefresh(() => router.refresh());
  }, [refreshing, router]);

  useEffect(() => {
    if (closed || paused) return;
    const timer = window.setInterval(() => refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [closed, paused, refresh]);

  useEffect(() => {
    if (refreshing || !manualRef.current) return;
    manualRef.current = false;
    setManualStatus("Sipariş durumu kontrol edildi.");
  }, [refreshing]);

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button type="button" disabled={refreshing} aria-busy={refreshing || undefined} onClick={() => refresh(true)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50">
        {refreshing ? "Güncelleniyor…" : "Şimdi güncelle"}
      </button>
      {!closed && (
        <button type="button" onClick={() => setPaused((value) => !value)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          {paused ? "Otomatik yenilemeyi sürdür" : "Otomatik yenilemeyi duraklat"}
        </button>
      )}
      {!closed && <p className="basis-full text-center text-xs text-muted">{paused ? "Otomatik güncelleme duraklatıldı." : "Sayfa 20 saniyede bir güncellenir."}</p>}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{manualStatus}</p>
    </div>
  );
}
