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
    try { await add([{ tabId: tab.id, tableId: tab.tableId, staffId: null, ev: { type: "kitchen", ticketId: t.id, status: t.status === "yeni" ? "hazirlaniyor" : "hazir" } }]); }
    finally { setBusy(null); }
  };
  const card = ({ tab, t }: { tab: TabState; t: Ticket }) => {
    const mins = minutesSince(t.at, now);
    return (
      <button key={t.id} type="button" disabled={busy === t.id || t.status === "hazir"} onClick={() => void next(tab, t)} data-ticket={t.id} data-status={t.status}
        className={`press flex flex-col overflow-hidden rounded-2xl border-2 bg-white text-left shadow-card ${t.status === "hazir" ? "border-ok" : t.status === "hazirlaniyor" ? "border-warn" : mins >= 15 ? "border-bad" : "border-line"}`}>
        <span className={`flex items-baseline gap-2 px-3.5 py-2.5 ${t.status === "hazir" ? "bg-ok-soft" : t.status === "hazirlaniyor" ? "bg-warn-soft" : mins >= 15 ? "bg-bad-soft" : "bg-surface-2"}`}>
          <span className="text-2xl font-bold tracking-tight">{tabLabel(tab, tables, PLATFORM_NAMES)}</span>
          <span className="text-sm text-muted">{stations.find((s) => s.id === t.stationId)?.name ?? ""}</span>
          <span className={`tabular ml-auto text-sm ${mins >= 15 && t.status !== "hazir" ? "font-bold text-bad" : "text-muted"}`}>{mins} dk</span>
        </span>
        <ul className="flex-1 space-y-1.5 px-3.5 py-3">
          {t.lineIds.map((id) => {
            const l = tab.lines.find((x) => x.lineId === id);
            if (!l) return null;
            return (
              <li key={id} className={l.voided ? "text-bad line-through" : ""}>
                <span className="text-lg font-semibold">{qtyText(l.qtyMilli)} × {l.name}</span>{l.voided && <span className="ml-2 text-sm font-bold no-underline">İPTAL</span>}
                {l.options.length > 0 && <span className="block text-sm">+ {optionsText(l.options)}</span>}
                {l.note && <span className="block text-sm font-medium text-warn">! {l.note}</span>}
              </li>
            );
          })}
        </ul>
        <span className={`mx-3.5 mb-3.5 rounded-[10px] py-2.5 text-center text-sm font-semibold ${t.status === "yeni" ? "bg-ink text-white" : t.status === "hazirlaniyor" ? "bg-ok text-white" : "bg-ok-soft text-ok"}`}>{t.status === "yeni" ? "Dokun: hazırlanıyor" : t.status === "hazirlaniyor" ? "Dokun: hazır" : "Hazır"}</span>
      </button>
    );
  };
  const open = items.filter((i) => i.t.status !== "hazir");
  const ready = items.filter((i) => i.t.status === "hazir");
  return (
    <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_20rem]">
      <section aria-label="Bekleyen siparişler">
        {open.length === 0 ? <p className="p-12 text-center text-muted">Bekleyen sipariş yok.</p> : <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{open.map(card)}</div>}
      </section>
      <section aria-label="Hazır" className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-ok"><span className="size-2 rounded-full bg-ok" />Hazır</h2>
        {ready.map(card)}
      </section>
    </div>
  );
}
