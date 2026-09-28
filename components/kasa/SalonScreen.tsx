"use client";
// Masa planı: bölge sekmeleri, masa kartları (durum rengi, toplam, süre, hazır/hesap rozetleri).
import { useState } from "react";
import { formatTL } from "@/lib/core/money";
import { openTabsByTable, tableStatus, type TabState, type TableStatus } from "@/lib/core/tab";
import type { Area, Table } from "@/lib/offline/state";
import { minutesSince } from "./useTabs";

const TONE: Record<TableStatus, string> = {
  bos: "border-line bg-white",
  dolu: "border-brand bg-brand-soft",
  hazir: "border-emerald-600 bg-emerald-50",
  uzun: "border-amber-500 bg-amber-50",
};
const LABEL: Record<TableStatus, string> = { bos: "Boş", dolu: "Dolu", hazir: "Hazır bekliyor", uzun: "Uzun süredir açık" };

export function SalonScreen({ areas, tables, tabs, now, onOpen }: { areas: Area[]; tables: Table[]; tabs: Map<string, TabState>; now: number; onOpen: (tableId: string) => void }) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const byTable = openTabsByTable(tabs);
  if (!areas.length) return <p className="p-8 text-center text-muted">Masa tanımlı değil. Yönetim → Salon sayfasından bölge ve masa ekleyin.</p>;
  const current = areas.some((a) => a.id === areaId) ? areaId : areas[0].id;
  return (
    <div className="p-4">
      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Bölgeler">
        {areas.map((a) => {
          const busy = tables.filter((t) => t.areaId === a.id && byTable.has(t.id)).length;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={a.id === current} onClick={() => setAreaId(a.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm ${a.id === current ? "bg-brand font-medium text-white" : "border border-line hover:bg-stone-50"}`}>
              {a.name}{busy > 0 && <span className="ml-1.5 opacity-80">({busy})</span>}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {tables.filter((t) => t.areaId === current).map((t) => {
          const open = byTable.get(t.id) ?? [];
          const st = tableStatus(open, now);
          const total = open.reduce((a, x) => a + x.remaining, 0);
          const since = open.length ? minutesSince(open.reduce((a, x) => (x.openedAt < a ? x.openedAt : a), open[0].openedAt), now) : 0;
          return (
            <button key={t.id} type="button" onClick={() => onOpen(t.id)} aria-label={`${t.name}, ${LABEL[st]}`} data-status={st}
              className={`flex min-h-28 flex-col rounded-xl border-2 p-3 text-left transition hover:shadow ${TONE[st]}`}>
              <span className="text-lg font-semibold">{t.name}</span>
              {open.length > 0 && <span className="tabular mt-auto font-medium">{formatTL(total)}</span>}
              {open.length > 0 && <span className="text-xs text-muted">{since} dk{open.length > 1 ? ` · ${open.length} adisyon` : ""}</span>}
              <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-medium">
                {st === "hazir" && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">Hazır</span>}
                {open.some((x) => x.billRequested) && <span className="rounded bg-ink px-1.5 py-0.5 text-white">Hesap</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
