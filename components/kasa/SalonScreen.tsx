"use client";
// Masa planı: bölge sekmeleri, masa kartları (durum rengi, toplam, süre, hazır/hesap rozetleri).
import { useState } from "react";
import { formatTL } from "@/lib/core/money";
import { openTabsByTable, tableStatus, type TabState, type TableStatus } from "@/lib/core/tab";
import type { Area, Table } from "@/lib/offline/state";
import { minutesSince } from "./useTabs";
import { MasaGlyph } from "@/components/MasaGlyph";

const TONE: Record<TableStatus, string> = {
  bos: "border-line bg-surface",
  dolu: "border-brand/60 bg-brand-soft",
  hazir: "border-ok bg-ok-soft",
  uzun: "border-warn bg-warn-soft",
};
const BAR: Record<TableStatus, string> = { bos: "bg-transparent", dolu: "bg-brand", hazir: "bg-ok", uzun: "bg-warn" };
const LABEL: Record<TableStatus, string> = { bos: "Boş", dolu: "Dolu", hazir: "Hazır bekliyor", uzun: "Uzun süredir açık" };
const GLYPH: Record<TableStatus, string> = { bos: "text-line", dolu: "text-brand", hazir: "text-ok", uzun: "text-warn" };

export function SalonScreen({ areas, tables, tabs, now, onOpen }: { areas: Area[]; tables: Table[]; tabs: Map<string, TabState>; now: number; onOpen: (tableId: string) => void }) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const byTable = openTabsByTable(tabs);
  if (!areas.length) return <p className="p-8 text-center text-muted">Masa tanımlı değil. Yönetim → Salon sayfasından bölge ve masa ekleyin.</p>;
  const current = areas.some((a) => a.id === areaId) ? areaId : areas[0].id;
  return (
    <div className="p-4">
      <div className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-3 p-1" role="tablist" aria-label="Bölgeler">
        {areas.map((a) => {
          const busy = tables.filter((t) => t.areaId === a.id && byTable.has(t.id)).length;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={a.id === current} onClick={() => setAreaId(a.id)} className={`press h-10 whitespace-nowrap rounded-[9px] px-4 text-sm font-medium ${a.id === current ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
              {a.name}{busy > 0 && <span className="ml-1.5 opacity-80">({busy})</span>}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {tables.filter((t) => t.areaId === current).map((t) => {
          const open = byTable.get(t.id) ?? [];
          const st = tableStatus(open, now);
          const total = open.reduce((a, x) => a + x.remaining, 0);
          const since = open.length ? minutesSince(open.reduce((a, x) => (x.openedAt < a ? x.openedAt : a), open[0].openedAt), now) : 0;
          return (
            <button key={t.id} type="button" onClick={() => onOpen(t.id)} aria-label={`${t.name}, ${LABEL[st]}`} data-status={st}
              className={`press relative flex min-h-32 flex-col overflow-hidden rounded-2xl border-2 p-3.5 pt-4 text-left shadow-card hover:shadow-pop ${TONE[st]}`}>
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${BAR[st]}`} />
              <MasaGlyph className={`absolute right-3 top-3.5 ${GLYPH[st]}`} size={30} />
              <span className="text-xl font-semibold tracking-tight">{t.name}</span>
              {open.length === 0 && <span className="mt-auto text-xs font-medium text-muted">Boş</span>}
              {open.length > 0 && <span className="tabular mt-auto text-lg font-bold">{formatTL(total)}</span>}
              {open.length > 0 && <span className="text-xs text-muted">{since} dk{open.length > 1 ? ` · ${open.length} adisyon` : ""}</span>}
              <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-medium">
                {st === "hazir" && <span className="rounded bg-ok px-1.5 py-0.5 text-white">Hazır</span>}
                {open.some((x) => x.billRequested) && <span className="rounded bg-ink px-1.5 py-0.5 text-white">Hesap</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
