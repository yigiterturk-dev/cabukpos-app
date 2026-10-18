"use client";
import { tabLabel } from "@/lib/core/tab";
import { PLATFORM_NAMES } from "@/lib/core/platform";
// Mutfak ekranı: istasyon filtreli biletler. Dokun → hazırlanıyor → hazır. Hazırlar 10 dk ayrı sütunda.
import { useEffect, useMemo, useRef, useState } from "react";
import { optionsText } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import type { TabState, Ticket } from "@/lib/core/tab";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { minutesSince } from "./useTabs";
import { useKasaMainProps } from "./KasaPreviewContext";

const READY_SHOW_MS = 10 * 60_000;
const EMPTY_DEVICE_STATIONS: NonNullable<NonNullable<Meta["device"]>["stations"]> = [];
const EMPTY_STATIONS: NonNullable<NonNullable<Meta["catalog"]["stations"]>> = [];
const EMPTY_TABLES: NonNullable<NonNullable<Meta["catalog"]["tables"]>> = [];

export function KitchenScreen({ meta, tabs, now, add, loaded = true }: { meta: Meta; tabs: Map<string, TabState>; now: number; add: (l: NewTabEvent[]) => Promise<unknown>; loaded?: boolean }) {
  const mainProps = useKasaMainProps();
  const busyRef = useRef(new Set<string>());
  const previousRef = useRef<Map<string, Ticket["status"]> | null>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const filter = meta.device?.stations ?? EMPTY_DEVICE_STATIONS;
  const tables = meta.catalog.tables ?? EMPTY_TABLES;
  const stations = meta.catalog.stations ?? EMPTY_STATIONS;
  const items = useMemo(() => {
    const result: { tab: TabState; t: Ticket }[] = [];
    for (const tab of tabs.values()) for (const t of tab.tickets) {
      if (filter.length && t.stationId && !filter.includes(t.stationId)) continue;
      if (t.status === "teslim" || (t.status === "hazir" && now - Date.parse(t.readyAt ?? t.at) > READY_SHOW_MS)) continue;
      result.push({ tab, t });
    }
    result.sort((a, b) => a.t.at.localeCompare(b.t.at));
    return result;
  }, [tabs, filter, now]);
  useEffect(() => {
    if (!loaded) return;
    // Keep the baseline independent of the station filter so an existing ticket
    // becoming visible after a filter change is not announced as a new order.
    const current = new Map([...tabs.values()].flatMap((tab) => tab.tickets.map((ticket) => [ticket.id, ticket.status] as const)));
    const previous = previousRef.current;
    if (previous) {
      const changes: string[] = [];
      for (const { tab, t } of items) {
        const oldStatus = previous.get(t.id);
        const label = tabLabel(tab, tables, PLATFORM_NAMES);
        if (oldStatus === undefined) {
          const lines = t.lineIds.map((id) => tab.lines.find((line) => line.lineId === id && !line.voided)).filter(Boolean);
          const summary = lines.map((line) => `${qtyText(line!.qtyMilli)} ${line!.name}`).join(", ");
          changes.push(`Yeni bilet: ${label}${summary ? `, ${summary}` : ""}.`);
        } else if (oldStatus !== t.status) {
          changes.push(`${label} bileti: ${t.status === "hazirlaniyor" ? "Hazırlanıyor" : t.status === "hazir" ? "Hazır" : "Yeni sipariş"}.`);
        }
      }
      if (changes.length && announcementRef.current) {
        // The effect synchronizes the live region with the external ticket stream.
        announcementRef.current.textContent = changes.slice(0, 3).join(" ") + (changes.length > 3 ? ` Ayrıca ${changes.length - 3} bilet daha güncellendi.` : "");
      }
    }
    previousRef.current = current;
  }, [loaded, items, tabs, tables]);
  const next = async (tab: TabState, t: Ticket, source: HTMLButtonElement) => {
    if (t.status === "hazir" || busyRef.current.has(t.id)) return;
    busyRef.current.add(t.id);
    setBusy(new Set(busyRef.current));
    setActionError(null);
    let completed = false;
    try {
      await add([{ tabId: tab.id, tableId: tab.tableId, staffId: null, ev: { type: "kitchen", ticketId: t.id, status: t.status === "yeni" ? "hazirlaniyor" : "hazir" } }]);
      completed = true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Mutfak durumu güncellenemedi. Tekrar deneyin.");
    } finally {
      busyRef.current.delete(t.id);
      setBusy(new Set(busyRef.current));
      if (completed) requestAnimationFrame(() => requestAnimationFrame(() => {
        if (document.activeElement !== document.body && !(document.activeElement === source && source.disabled)) return;
        const updated = document.querySelector<HTMLButtonElement>(`button[data-ticket="${t.id}"]`);
        const target = updated && !updated.disabled
          ? updated
          : document.querySelector<HTMLButtonElement>('button[data-ticket]:not(:disabled)');
        (target ?? document.getElementById("kitchen-heading"))?.focus();
      }));
    }
  };
  const card = ({ tab, t }: { tab: TabState; t: Ticket }) => {
    const mins = minutesSince(t.at, now);
    return (
      <button key={t.id} type="button" disabled={t.status === "hazir" || busy.has(t.id)} aria-busy={busy.has(t.id) || undefined} onClick={(event) => void next(tab, t, event.currentTarget)} data-ticket={t.id} data-status={t.status}
        className={`press flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-surface text-left shadow-card outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none ${busy.has(t.id) ? "cursor-wait opacity-70" : ""} ${t.status === "hazir" ? "border-ok" : t.status === "hazirlaniyor" ? "border-warn" : mins >= 15 ? "border-bad" : "border-line"}`}>
        <span className={`flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-3.5 py-2.5 ${t.status === "hazir" ? "bg-ok-soft" : t.status === "hazirlaniyor" ? "bg-warn-soft" : mins >= 15 ? "bg-bad-soft" : "bg-surface-2"}`}>
          <span className="basis-full break-words font-display text-2xl font-extrabold tracking-tight">{tabLabel(tab, tables, PLATFORM_NAMES)}</span>
          <span className="min-w-0 flex-1 break-words text-sm text-muted">{stations.find((s) => s.id === t.stationId)?.name ?? ""}</span>
          <span className={`tabular ml-auto shrink-0 text-sm ${mins >= 15 && t.status !== "hazir" ? "font-bold text-bad" : "text-muted"}`}>{mins} dk</span>
        </span>
        <span className="flex flex-1 flex-col space-y-1.5 px-3.5 py-3">
          {t.lineIds.map((id) => {
            const l = tab.lines.find((x) => x.lineId === id);
            if (!l) return null;
            return (
              <span key={id} className={`block ${l.voided ? "text-bad line-through" : ""}`}>
                <span className="break-words text-lg font-semibold" title={`${qtyText(l.qtyMilli)} × ${l.name}`}>{qtyText(l.qtyMilli)} × {l.name}</span>{l.voided && <span className="ml-2 text-sm font-bold no-underline">İPTAL</span>}
                {l.options.length > 0 && <span className="block break-words text-sm" title={optionsText(l.options)}>+ {optionsText(l.options)}</span>}
                {l.note && <span className="block break-words text-sm font-medium text-warn" title={l.note}>! {l.note}</span>}
              </span>
            );
          })}
        </span>
        <span className={`mx-3.5 mb-3.5 rounded-[10px] py-2.5 text-center text-sm font-semibold ${t.status === "yeni" ? "bg-espresso text-white" : t.status === "hazirlaniyor" ? "bg-ok-action text-white" : "bg-ok-soft text-ok"}`}>{busy.has(t.id) ? "Güncelleniyor…" : t.status === "yeni" ? "Dokun: hazırlanıyor" : t.status === "hazirlaniyor" ? "Dokun: hazır" : "Hazır"}</span>
      </button>
    );
  };
  const open = items.filter((i) => i.t.status !== "hazir");
  const ready = items.filter((i) => i.t.status === "hazir");
  const late = open.filter(({ t }) => minutesSince(t.at, now) >= 15).length;
  return (
    <div {...mainProps} className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 outline-none">
      <p ref={announcementRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="kitchen-heading" tabIndex={-1} className="rounded-sm font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Mutfak</h1>
          <div role={loaded ? undefined : "status"} aria-live={loaded ? undefined : "polite"} className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">{loaded ? <><span>{open.length} bekleyen · {ready.length} hazır</span>{late > 0 && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">{late} geciken</span>}</> : "Siparişler yükleniyor…"}</div>
        </div>
        {filter.length > 0 && <span className="text-xs text-muted">İstasyon filtresi aktif</span>}
      </div>
      {actionError && <p className="mb-4 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad" role="alert" aria-live="assertive">{actionError}</p>}
      <div aria-busy={!loaded || undefined} className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {!loaded ? <p className="self-center rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted lg:col-span-2" aria-hidden="true">Siparişler yükleniyor…</p> : <>
        <section aria-label="Bekleyen siparişler" className="min-h-0 overflow-y-auto">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">Bekleyen <span className="tabular rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">{open.length}</span></h2>
          {open.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-line-strong p-12 text-center text-sm text-muted">Bekleyen sipariş yok.</p> : <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{open.map(card)}</div>}
        </section>
        <section aria-label="Hazır" className="min-h-0 space-y-3 overflow-y-auto rounded-2xl bg-surface-3/60 p-3">
          <h2 className="flex items-center gap-2 font-semibold text-ok"><span className="size-2 rounded-full bg-ok" />Hazır <span className="tabular rounded-full bg-ok-soft px-2 py-0.5 text-xs">{ready.length}</span></h2>
          {ready.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Hazır sipariş yok.</p>}
          {ready.map(card)}
        </section>
        </>}
      </div>
    </div>
  );
}
