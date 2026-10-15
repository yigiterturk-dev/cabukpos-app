"use client";
import { tabLabel } from "@/lib/core/tab";
import { PLATFORM_NAMES } from "@/lib/core/platform";
// Mutfak ekranı: istasyon filtreli biletler. Dokun → hazırlanıyor → hazır. Hazırlar 10 dk ayrı sütunda.
import { useState } from "react";
import { optionsText } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import type { TabState, Ticket } from "@/lib/core/tab";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { minutesSince } from "./useTabs";

const READY_SHOW_MS = 10 * 60_000;

export function KitchenScreen({ meta, tabs, now, add }: { meta: Meta; tabs: Map<string, TabState>; now: number; add: (l: NewTabEvent[]) => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const filter = meta.device?.stations ?? [];
  const tables = meta.catalog.tables ?? [];
  const stations = meta.catalog.stations ?? [];
  const items: { tab: TabState; t: Ticket }[] = [];
  for (const tab of tabs.values()) for (const t of tab.tickets) {
    if (filter.length && t.stationId && !filter.includes(t.stationId)) continue;
    if (t.status === "teslim" || (t.status === "hazir" && now - Date.parse(t.readyAt ?? t.at) > READY_SHOW_MS)) continue;
    items.push({ tab, t });
  }
  items.sort((a, b) => a.t.at.localeCompare(b.t.at));
  const next = async (tab: TabState, t: Ticket) => {
    if (t.status === "hazir") return;
    setBusy(t.id);
    setActionError(null);
    try {
      await add([{ tabId: tab.id, tableId: tab.tableId, staffId: null, ev: { type: "kitchen", ticketId: t.id, status: t.status === "yeni" ? "hazirlaniyor" : "hazir" } }]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Mutfak durumu güncellenemedi. Tekrar deneyin.");
    } finally { setBusy(null); }
  };
  const card = ({ tab, t }: { tab: TabState; t: Ticket }) => {
    const mins = minutesSince(t.at, now);
    return (
      <button key={t.id} type="button" disabled={busy === t.id || t.status === "hazir"} onClick={() => void next(tab, t)} data-ticket={t.id} data-status={t.status}
        className={`press flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-surface text-left shadow-card outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none ${t.status === "hazir" ? "border-ok" : t.status === "hazirlaniyor" ? "border-warn" : mins >= 15 ? "border-bad" : "border-line"}`}>
        <span className={`flex min-w-0 items-baseline gap-2 px-3.5 py-2.5 ${t.status === "hazir" ? "bg-ok-soft" : t.status === "hazirlaniyor" ? "bg-warn-soft" : mins >= 15 ? "bg-bad-soft" : "bg-surface-2"}`}>
          <span className="min-w-0 truncate font-display text-2xl font-extrabold tracking-tight" title={tabLabel(tab, tables, PLATFORM_NAMES)}>{tabLabel(tab, tables, PLATFORM_NAMES)}</span>
          <span className="min-w-0 truncate text-sm text-muted" title={stations.find((s) => s.id === t.stationId)?.name ?? ""}>{stations.find((s) => s.id === t.stationId)?.name ?? ""}</span>
          <span className={`tabular ml-auto shrink-0 text-sm ${mins >= 15 && t.status !== "hazir" ? "font-bold text-bad" : "text-muted"}`}>{mins} dk</span>
        </span>
        <ul className="flex-1 space-y-1.5 px-3.5 py-3">
          {t.lineIds.map((id) => {
            const l = tab.lines.find((x) => x.lineId === id);
            if (!l) return null;
            return (
              <li key={id} className={l.voided ? "text-bad line-through" : ""}>
                <span className="break-words text-lg font-semibold" title={`${qtyText(l.qtyMilli)} × ${l.name}`}>{qtyText(l.qtyMilli)} × {l.name}</span>{l.voided && <span className="ml-2 text-sm font-bold no-underline">İPTAL</span>}
                {l.options.length > 0 && <span className="block break-words text-sm" title={optionsText(l.options)}>+ {optionsText(l.options)}</span>}
                {l.note && <span className="block break-words text-sm font-medium text-warn" title={l.note}>! {l.note}</span>}
              </li>
            );
          })}
        </ul>
        <span role="status" aria-live="polite" className={`mx-3.5 mb-3.5 rounded-[10px] py-2.5 text-center text-sm font-semibold ${t.status === "yeni" ? "bg-ink text-white" : t.status === "hazirlaniyor" ? "bg-ok text-white" : "bg-ok-soft text-ok"}`}>{busy === t.id ? "Güncelleniyor…" : t.status === "yeni" ? "Dokun: hazırlanıyor" : t.status === "hazirlaniyor" ? "Dokun: hazır" : "Hazır"}</span>
      </button>
    );
  };
  const open = items.filter((i) => i.t.status !== "hazir");
  const ready = items.filter((i) => i.t.status === "hazir");
  const late = open.filter(({ t }) => minutesSince(t.at, now) >= 15).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Mutfak</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted"><span>{open.length} bekleyen · {ready.length} hazır</span>{late > 0 && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">{late} geciken</span>}</div>
        </div>
        {filter.length > 0 && <span className="text-xs text-muted">İstasyon filtresi aktif</span>}
      </div>
      {actionError && <p className="mb-4 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad" role="alert" aria-live="assertive">{actionError}</p>}
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Bekleyen siparişler" className="min-h-0 overflow-y-auto">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">Bekleyen <span className="tabular rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">{open.length}</span></h2>
          {open.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-line-strong p-12 text-center text-sm text-muted">Bekleyen sipariş yok.</p> : <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{open.map(card)}</div>}
        </section>
        <section aria-label="Hazır" className="min-h-0 space-y-3 overflow-y-auto rounded-2xl bg-surface-3/60 p-3">
          <h2 className="flex items-center gap-2 font-semibold text-ok"><span className="size-2 rounded-full bg-ok" />Hazır <span className="tabular rounded-full bg-ok-soft px-2 py-0.5 text-xs">{ready.length}</span></h2>
          {ready.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Hazır sipariş yok.</p>}
          {ready.map(card)}
        </section>
      </div>
    </div>
  );
}
