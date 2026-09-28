"use client";
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
        className={`flex flex-col rounded-xl border-2 p-3 text-left ${t.status === "hazir" ? "border-emerald-600 bg-emerald-50" : t.status === "hazirlaniyor" ? "border-amber-500 bg-amber-50" : mins >= 15 ? "border-red-600 bg-white" : "border-line bg-white"}`}>
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{tables.find((x) => x.id === tab.tableId)?.name ?? "?"}</span>
          <span className="text-sm text-muted">{stations.find((s) => s.id === t.stationId)?.name ?? ""}</span>
          <span className={`tabular ml-auto text-sm ${mins >= 15 && t.status !== "hazir" ? "font-bold text-red-700" : "text-muted"}`}>{mins} dk</span>
        </span>
        <ul className="mt-2 space-y-1">
          {t.lineIds.map((id) => {
            const l = tab.lines.find((x) => x.lineId === id);
            if (!l) return null;
            return (
              <li key={id} className={l.voided ? "text-red-700 line-through" : ""}>
                <span className="text-lg font-semibold">{qtyText(l.qtyMilli)} × {l.name}</span>{l.voided && <span className="ml-2 text-sm font-bold no-underline">İPTAL</span>}
                {l.options.length > 0 && <span className="block text-sm">+ {optionsText(l.options)}</span>}
                {l.note && <span className="block text-sm font-medium text-amber-800">! {l.note}</span>}
              </li>
            );
          })}
        </ul>
        <span className="mt-3 text-sm font-medium">{t.status === "yeni" ? "Dokun: hazırlanıyor" : t.status === "hazirlaniyor" ? "Dokun: hazır" : "Hazır"}</span>
      </button>
    );
  };
  const open = items.filter((i) => i.t.status !== "hazir");
  const ready = items.filter((i) => i.t.status === "hazir");
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_20rem]">
      <section aria-label="Bekleyen siparişler">
        {open.length === 0 ? <p className="p-12 text-center text-muted">Bekleyen sipariş yok.</p> : <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{open.map(card)}</div>}
      </section>
      <section aria-label="Hazır" className="space-y-3">
        <h2 className="font-semibold text-emerald-700">Hazır</h2>
        {ready.map(card)}
      </section>
    </div>
  );
}
