"use client";
// Masa planı: bölge sekmeleri, masa kartları (durum rengi, toplam, süre, hazır/hesap rozetleri).
// Üstte garson çağrısı panosu: 8 sn'de bir çeker, yeni çağrıda öter, "Geldim" kapatır.
import { useEffect, useRef, useState } from "react";
import type { Currency } from "@/lib/core/money";
import { kasaFmt } from "./kasa-format";
import { openTabsByTable, tableStatus, type TabState, type TableStatus } from "@/lib/core/tab";
import type { Area, Table } from "@/lib/offline/state";
import { minutesSince } from "./useTabs";
import { MasaGlyph } from "@/components/MasaGlyph";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Empty } from "@/components/ui";
import { beep } from "./beep";
import { useKasaMainProps } from "./KasaPreviewContext";

const TONE: Record<TableStatus, string> = {
  bos: "border-line bg-surface",
  dolu: "border-brand/60 bg-brand-soft",
  hazir: "border-ok bg-ok-soft",
  uzun: "border-warn bg-warn-soft",
};
const BAR: Record<TableStatus, string> = { bos: "bg-transparent", dolu: "bg-brand-action", hazir: "bg-ok", uzun: "bg-warn" };
const LABEL: Record<TableStatus, string> = { bos: "Boş", dolu: "Dolu", hazir: "Hazır bekliyor", uzun: "Uzun süredir açık" };
const GLYPH: Record<TableStatus, string> = { bos: "text-line", dolu: "text-brand", hazir: "text-ok", uzun: "text-warn" };
const CHIP: Record<TableStatus, string> = { bos: "bg-surface-3 text-muted", dolu: "bg-brand-soft text-brand", hazir: "bg-ok-soft text-ok", uzun: "bg-warn-soft text-warn" };

type CallRow = { id: string; table: string; note: string | null; createdAt: string };

function useCalls(enabled = true) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [callStatus, setCallStatus] = useState<"loading" | "ok" | "error" | "unavailable">(enabled ? "loading" : "ok");
  const loadedOnce = useRef(false);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/kasa/calls", { cache: "no-store", signal: AbortSignal.timeout(6500) });
        if (!r.ok) {
          if (alive) setCallStatus(loadedOnce.current ? "error" : "unavailable");
          return;
        }
        const j = (await r.json()) as { calls: CallRow[] };
        if (!alive) return;
        const previous = seen.current;
        if (previous === null ? j.calls.length > 0 : j.calls.some((call) => !previous.has(call.id))) beep(true);
        seen.current = new Set(j.calls.map((call) => call.id));
        setCalls(j.calls);
        loadedOnce.current = true;
        setCallStatus("ok");
      } catch {
        if (alive) setCallStatus(loadedOnce.current ? "error" : "unavailable");
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled]);
  return [calls, setCalls, callStatus] as const;
}

export function SalonScreen({ areas, tables, tabs, tabsLoaded = true, now, onOpen, currency, callsEnabled = true }: { areas: Area[]; tables: Table[]; tabs: Map<string, TabState>; tabsLoaded?: boolean; now: number; onOpen: (tableId: string) => void; currency?: Currency; callsEnabled?: boolean }) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt({ device: { currency } });
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [calls, setCalls, callStatus] = useCalls(callsEnabled);
  const announcedCalls = useRef<Set<string> | null>(null);
  const callAnnouncement = useRef<HTMLParagraphElement>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const resolvingRef = useRef(false);
  const [callError, setCallError] = useState<string | null>(null);
  const lastResolveButtonRef = useRef<HTMLButtonElement | null>(null);
  const salonHeadingRef = useRef<HTMLHeadingElement>(null);
  const callErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!callError || resolving) return;
    const frame = window.requestAnimationFrame(() => {
      const retry = lastResolveButtonRef.current;
      if (retry?.isConnected && !retry.disabled) retry.focus();
      else callErrorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [callError, resolving]);
  useEffect(() => {
    if (resolving || callError || !lastResolveButtonRef.current) return;
    const removedButton = lastResolveButtonRef.current;
    if (removedButton.isConnected) return;
    lastResolveButtonRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const next = document.querySelector<HTMLButtonElement>("[data-call-resolve]");
      (next ?? salonHeadingRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [callError, calls, resolving]);
  const byTable = openTabsByTable(tabs);
  useEffect(() => {
    const previous = announcedCalls.current;
    if (previous) {
      const added = calls.filter((call) => !previous.has(call.id));
      if (added.length && callAnnouncement.current) {
        const messages = added.slice(0, 3).map((call) => `Yeni garson çağrısı: ${call.table}.`);
        callAnnouncement.current.textContent = messages.join(" ") + (added.length > 3 ? ` Ayrıca ${added.length - 3} çağrı daha.` : "");
      }
    }
    announcedCalls.current = new Set(calls.map((call) => call.id));
  }, [calls]);
  const current = areas.some((a) => a.id === areaId) ? areaId : areas[0]?.id ?? "";
  const visibleTables = tables.filter((t) => t.areaId === current);
  const occupiedTables = visibleTables.filter((t) => byTable.has(t.id)).length;
  const resolve = async (call: CallRow) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(call.id);
    setCallError(null);
    try {
      const r = await fetch("/api/kasa/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: call.id }), signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        setCalls((cs) => cs.filter((c) => c.id !== call.id));
        if (callAnnouncement.current) callAnnouncement.current.textContent = `${call.table} garson çağrısı kapatıldı.`;
      }
      else setCallError("Çağrı kapatılamadı. Bağlantıyı kontrol edip tekrar deneyin.");
    } catch { setCallError("Çağrı kapatılamadı. Bağlantıyı kontrol edip tekrar deneyin."); }
    finally { resolvingRef.current = false; setResolving(null); }
  };
  return (
    <div {...mainProps} className="min-w-0 p-4 outline-none">
      <p ref={callAnnouncement} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      {resolving && <p className="sr-only" role="status" aria-live="polite">Garson çağrısı kapatılıyor. Lütfen bekleyin.</p>}
      {callsEnabled && callStatus !== "ok" && <p className={`mb-3 rounded-xl px-3 py-2 text-sm ${callStatus === "error" || callStatus === "unavailable" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"}`} role="status" aria-live="polite">{callStatus === "loading" ? "Garson çağrıları yükleniyor…" : callStatus === "unavailable" ? "Garson çağrıları yüklenemedi. Bağlantı kurulunca yeniden denenecek." : "Garson çağrıları güncellenemiyor. Son görünen liste eski olabilir; bağlantı kurulunca yeniden denenecek."}</p>}
      {callError && <p ref={callErrorRef} tabIndex={-1} className="mb-4 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert">{callError}</p>}
      {calls.length > 0 && (
        <ul aria-label="Garson çağrıları" className="mb-4 space-y-1">
          {calls.map((c) => (
            <li key={c.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border-2 border-warn bg-warn-soft px-3 py-2 text-sm">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn motion-safe:animate-pulse" />
              <span className="min-w-0 flex-1 break-words font-semibold">{c.table}</span>
              <span className="shrink-0 text-muted">{minutesSince(c.createdAt, now)} dk önce</span>
              <button type="button" data-call-resolve disabled={resolving !== null} aria-label={resolving === c.id ? `${c.table} çağrısı kapatılıyor` : `${c.table} çağrısına geldim`} aria-busy={resolving === c.id || undefined} onClick={(e) => { lastResolveButtonRef.current = e.currentTarget; void resolve(c); }} className={`press ml-auto min-h-12 shrink-0 rounded-lg bg-espresso px-3 py-1.5 text-xs font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50 ${resolving === c.id ? "cursor-wait opacity-70" : ""}`}>{resolving === c.id ? "Kapatılıyor…" : "Geldim"}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 ref={salonHeadingRef} tabIndex={-1} className="font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Salon</h1>
          {areas.length > 0 && <p role={tabsLoaded ? undefined : "status"} aria-live={tabsLoaded ? undefined : "polite"} className="mt-0.5 text-sm text-muted">{tabsLoaded ? `${occupiedTables} dolu · ${visibleTables.length - occupiedTables} boş masa` : "Adisyonlar yükleniyor…"}</p>}
        </div>
        {tabsLoaded && areas.length > 0 && <span className="text-xs text-muted">Bir masaya dokunarak adisyonu açın</span>}
      </div>
      {!areas.length ? (
        <p className="p-8 text-center text-muted">Masa tanımlı değil. Yönetim → Salon sayfasından bölge ve masa ekleyin.</p>
      ) : <>
        <HorizontalScrollRegion label="Salon bölgeleri, yatay kaydırılabilir" className="mb-4 inline-flex max-w-full gap-1 rounded-xl bg-surface-3 p-1">
            {areas.map((a) => {
            const busy = tables.filter((t) => t.areaId === a.id && byTable.has(t.id)).length;
            return (
              <button key={a.id} type="button" aria-pressed={a.id === current} title={a.name} onClick={() => setAreaId(a.id)} className={`press min-h-12 whitespace-nowrap rounded-[9px] px-4 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${a.id === current ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
                {a.name}{tabsLoaded && busy > 0 && <span className="ml-1.5 opacity-80">({busy})</span>}
              </button>
            );
          })}
        </HorizontalScrollRegion>
        {!tabsLoaded ? (
          <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted" aria-hidden="true">Masalar ve adisyonlar yükleniyor…</div>
        ) : visibleTables.length === 0 ? (
          <Empty>Masa yok. Bu bölgeye masa eklemek için Yönetim → Salon sayfasını açın.</Empty>
        ) : (
          <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
          {visibleTables.map((t) => {
          const open = byTable.get(t.id) ?? [];
          const st = tableStatus(open, now);
          const total = open.reduce((a, x) => a + x.remaining, 0);
          const since = open.length ? minutesSince(open.reduce((a, x) => (x.openedAt < a ? x.openedAt : a), open[0].openedAt), now) : 0;
          return (
            <button key={t.id} type="button" onClick={() => onOpen(t.id)} aria-label={`${t.name}, ${LABEL[st]}${open.length > 0 ? `, kalan ${TL(total)}, ${since} dakikadır açık, ${open.length} açık adisyon${open.some((x) => x.billRequested) ? ", hesap istendi" : ""}` : ""}`} data-status={st}
              className={`press relative flex min-w-0 min-h-32 flex-col overflow-hidden rounded-2xl border-2 p-3.5 pt-4 text-left shadow-rest outline-none transition-[transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${TONE[st]}`}>
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${BAR[st]}`} />
              <MasaGlyph className={`absolute right-3 top-3.5 ${GLYPH[st]}`} size={30} />
              <span className="min-w-0 break-words pr-9 font-display text-lg font-bold leading-tight tracking-tight">{t.name}</span>
              {open.length === 0 && <span className="mt-auto text-xs font-medium text-muted">Boş</span>}
              {open.length > 0 && <span className="tabular mt-auto font-display text-xl font-extrabold tracking-tight">{TL(total)}</span>}
              {open.length > 0 && <span className="text-xs text-muted">{since} dk{open.length > 1 ? ` · ${open.length} adisyon` : ""}</span>}
              <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-medium">
                {st !== "bos" && <span className={`rounded px-1.5 py-0.5 ${CHIP[st]}`}>{LABEL[st]}</span>}
                {open.some((x) => x.billRequested) && <span className="rounded bg-espresso px-1.5 py-0.5 text-white">Hesap</span>}
              </span>
            </button>
          );
          })}
          </div>
        )}
      </>}
    </div>
  );
}
