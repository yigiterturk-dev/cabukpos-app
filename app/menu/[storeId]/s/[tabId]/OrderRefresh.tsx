"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function OrderRefresh({ closed }: { closed: boolean }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [manualPending, setManualPending] = useState(false);
  const [manualStatus, setManualStatus] = useState("");
  const manualButtonRef = useRef<HTMLButtonElement>(null);
  const refreshInFlightRef = useRef(false);
  const manualRef = useRef(false);

  const refresh = useCallback((manual = false) => {
    if (refreshInFlightRef.current) {
      if (manual) {
        manualRef.current = true;
        setManualPending(true);
        setManualStatus("Sipariş durumu güncelleniyor.");
      }
      return;
    }
    if (refreshing) return;
    refreshInFlightRef.current = true;
    if (manual) {
      manualRef.current = true;
      setManualPending(true);
      setManualStatus("Sipariş durumu güncelleniyor.");
    }
    startRefresh(() => router.refresh());
  }, [refreshing, router]);

  useEffect(() => {
    if (closed || paused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 20_000);
    const onVisibilityChange = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [closed, paused, refresh]);

  useEffect(() => {
    if (refreshing || !refreshInFlightRef.current) return;
    refreshInFlightRef.current = false;
    if (!manualRef.current) return;
    manualRef.current = false;
    setManualStatus("Sipariş durumu kontrol edildi.");
    setManualPending(false);
    window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) manualButtonRef.current?.focus();
    });
  }, [refreshing]);

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button ref={manualButtonRef} type="button" disabled={manualPending} aria-busy={manualPending || undefined} onClick={() => refresh(true)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50">
        {manualPending ? "Güncelleniyor…" : "Şimdi güncelle"}
      </button>
      {!closed && (
        <button type="button" aria-pressed={!paused} onClick={() => setPaused((value) => !value)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          Otomatik yenileme
        </button>
      )}
      {!closed && <p className="basis-full text-center text-xs text-muted">{paused ? "Otomatik güncelleme duraklatıldı." : "Sayfa 20 saniyede bir güncellenir."}</p>}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{manualStatus}</p>
    </div>
  );
}
