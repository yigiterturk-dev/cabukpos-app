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
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/kasa/calls", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { calls: CallRow[] };
        if (!alive) return;
        const previous = seen.current;
        if (previous === null ? j.calls.length > 0 : j.calls.some((call) => !previous.has(call.id))) beep(true);
        seen.current = new Set(j.calls.map((call) => call.id));
        setCalls(j.calls);
      } catch { /* çevrimdışı: sonraki turda tekrar */ }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled]);
  return [calls, setCalls] as const;
}

export function SalonScreen({ areas, tables, tabs, now, onOpen, currency, callsEnabled = true }: { areas: Area[]; tables: Table[]; tabs: Map<string, TabState>; now: number; onOpen: (tableId: string) => void; currency?: Currency; callsEnabled?: boolean }) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt({ device: { currency } });
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [calls, setCalls] = useCalls(callsEnabled);
  const announcedCalls = useRef<Set<string> | null>(null);
  const callAnnouncement = useRef<HTMLParagraphElement>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const resolvingRef = useRef(false);
  const [callError, setCallError] = useState<string | null>(null);
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
  if (!areas.length) return <p className="p-8 text-center text-muted">Masa tanımlı değil. Yönetim → Salon sayfasından bölge ve masa ekleyin.</p>;
  const current = areas.some((a) => a.id === areaId) ? areaId : areas[0].id;
  const visibleTables = tables.filter((t) => t.areaId === current);
  const occupiedTables = visibleTables.filter((t) => byTable.has(t.id)).length;
  const resolve = async (call: CallRow) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(call.id);
    setCallError(null);
    try {
      const r = await fetch("/api/kasa/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: call.id }) });
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
      {callError && <p className="mb-4 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">{callError}</p>}
      {calls.length > 0 && (
        <ul aria-label="Garson çağrıları" className="mb-4 space-y-1">
          {calls.map((c) => (
            <li key={c.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border-2 border-warn bg-warn-soft px-3 py-2 text-sm">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn motion-safe:animate-pulse" />
              <span className="min-w-0 flex-1 break-words font-semibold">{c.table}</span>
              <span className="shrink-0 text-muted">{minutesSince(c.createdAt, now)} dk önce</span>
              <button type="button" disabled={resolving !== null} aria-label={resolving === c.id ? `${c.table} çağrısı kapatılıyor` : `${c.table} çağrısına geldim`} aria-busy={resolving === c.id || undefined} onClick={() => void resolve(c)} className={`press ml-auto min-h-12 shrink-0 rounded-lg bg-espresso px-3 py-1.5 text-xs font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50 ${resolving === c.id ? "cursor-wait opacity-70" : ""}`}>{resolving === c.id ? "Kapatılıyor…" : "Geldim"}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Salon</h1>
          <p className="mt-0.5 text-sm text-muted">{occupiedTables} dolu · {visibleTables.length - occupiedTables} boş masa</p>
        </div>
        <span className="text-xs text-muted">Bir masaya dokunarak adisyonu açın</span>
      </div>
      <div className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-3 p-1" role="group" aria-label="Bölgeler">
        {areas.map((a) => {
          const busy = tables.filter((t) => t.areaId === a.id && byTable.has(t.id)).length;
          return (
            <button key={a.id} type="button" aria-pressed={a.id === current} title={a.name} onClick={() => setAreaId(a.id)} className={`press min-h-12 whitespace-nowrap rounded-[9px] px-4 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${a.id === current ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
              {a.name}{busy > 0 && <span className="ml-1.5 opacity-80">({busy})</span>}
            </button>
          );
        })}
      </div>
      {visibleTables.length === 0 ? (
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
    </div>
  );
}
