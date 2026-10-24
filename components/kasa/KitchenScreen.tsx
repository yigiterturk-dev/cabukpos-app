"use client";
import { tabLabel } from "@/lib/core/tab";
import { PLATFORM_NAMES } from "@/lib/core/platform";
// Mutfak ekranı: istasyon filtreli biletler. Dokun → hazırlanıyor → hazır. Hazırlar 10 dk ayrı sütunda.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { optionsText } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import type { TabState, Ticket } from "@/lib/core/tab";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { minutesSince } from "./useTabs";
import { useKasaMainProps } from "./KasaPreviewContext";
import { useKasaSetting } from "./useKasaSetting";
import { normalizeSearchText } from "@/lib/core/search";

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
  const [layout, setLayout] = useKasaSetting(`cabukpos:mutfak:gorunum:${meta.device?.id ?? "preview"}`, ["detay", "kompakt"], "detay");
  const [textSize, setTextSize] = useKasaSetting(`cabukpos:mutfak:yazi:${meta.device?.id ?? "preview"}`, ["normal", "buyuk"], "normal");
  const compact = layout === "kompakt";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const filter = meta.device?.stations ?? EMPTY_DEVICE_STATIONS;
  const tables = meta.catalog.tables ?? EMPTY_TABLES;
  const stations = meta.catalog.stations ?? EMPTY_STATIONS;
  const items = useMemo(() => {
    const result: { tab: TabState; t: Ticket }[] = [];
    for (const tab of tabs.values()) for (const t of tab.tickets) {
      if (filter.length && t.stationId && !filter.includes(t.stationId)) continue;
      if ((tab.delivery.cancelled || tab.delivery.rejected) && tab.closedAt && now - Date.parse(tab.closedAt) > READY_SHOW_MS) continue;
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
    if (t.status === "hazir" || tab.delivery.cancelled || tab.delivery.rejected || busyRef.current.has(t.id)) return;
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
  const onTicketClick = (event: MouseEvent<HTMLButtonElement>) => {
    const source = event.currentTarget;
    const tab = tabs.get(source.dataset.tabId ?? "");
    const ticket = tab?.tickets.find(t => t.id === source.dataset.ticket);
    if (tab && ticket) void next(tab, ticket, source);
  };
  const card = ({ tab, t }: { tab: TabState; t: Ticket }) => {
    const mins = minutesSince(t.at, now);
    const cancelled = !!(tab.delivery.cancelled || tab.delivery.rejected);
    return (
      <button key={t.id} type="button" disabled={cancelled || t.status === "hazir" || busy.has(t.id)} aria-busy={busy.has(t.id) || undefined} onClick={onTicketClick} data-tab-id={tab.id} data-ticket={t.id} data-status={t.status}
        className={`press flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-surface text-left shadow-card outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none ${busy.has(t.id) ? "cursor-wait opacity-70" : ""} ${t.status === "hazir" ? "border-ok" : t.status === "hazirlaniyor" ? "border-warn" : mins >= 15 ? "border-bad" : "border-line"}`}>
        <span className={`flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-3.5 py-2.5 ${t.status === "hazir" ? "bg-ok-soft" : t.status === "hazirlaniyor" ? "bg-warn-soft" : mins >= 15 ? "bg-bad-soft" : "bg-surface-2"}`}>
          <span className={`basis-full break-words font-display font-extrabold tracking-tight ${compact ? textSize === "buyuk" ? "text-xl" : "text-lg" : textSize === "buyuk" ? "text-3xl" : "text-2xl"}`}>{tabLabel(tab, tables, PLATFORM_NAMES)}</span>
          <span className="min-w-0 flex-1 break-words text-sm text-muted">{stations.find((s) => s.id === t.stationId)?.name ?? ""}</span>
          <span className={`tabular ml-auto shrink-0 text-sm ${mins >= 15 && t.status !== "hazir" ? "font-bold text-bad" : "text-muted"}`}>{mins} dk</span>
        </span>
        <span className="flex flex-1 flex-col space-y-1.5 px-3.5 py-3">
          {t.lineIds.map((id) => {
            const l = tab.lines.find((x) => x.lineId === id);
            if (!l) return null;
            return (
              <span key={id} className={`block ${l.voided || cancelled ? "text-bad line-through" : ""}`}>
                <span className={`break-words font-semibold ${compact ? textSize === "buyuk" ? "text-lg" : "text-base" : textSize === "buyuk" ? "text-xl" : "text-lg"}`} title={`${qtyText(l.qtyMilli)} × ${l.name}`}>{qtyText(l.qtyMilli)} × {l.name}</span>{(l.voided || cancelled) && <span className="ml-2 text-sm font-bold no-underline">İPTAL</span>}
                {l.options.length > 0 && <span className="block break-words text-sm" title={optionsText(l.options)}>+ {optionsText(l.options)}</span>}
                {l.note && <span className="block break-words text-sm font-medium text-warn" title={l.note}>! {l.note}</span>}
              </span>
            );
          })}
        </span>
        <span className={`mx-3.5 mb-3.5 rounded-[10px] py-2.5 text-center text-sm font-semibold ${cancelled ? "bg-bad-soft text-bad" : t.status === "yeni" ? "bg-espresso text-white" : t.status === "hazirlaniyor" ? "bg-ok-action text-white" : "bg-ok-soft text-ok"}`}>{cancelled ? "Sipariş iptal edildi" : busy.has(t.id) ? "Güncelleniyor…" : t.status === "yeni" ? "Dokun: hazırlanıyor" : t.status === "hazirlaniyor" ? "Dokun: hazır" : "Hazır"}</span>
      </button>
    );
  };
  const cancelledCount = items.filter(({ tab }) => tab.delivery.cancelled || tab.delivery.rejected).length;
  const open = items.filter(({ tab, t }) => t.status !== "hazir" || tab.delivery.cancelled || tab.delivery.rejected);
  const ready = items.filter(({ tab, t }) => t.status === "hazir" && !tab.delivery.cancelled && !tab.delivery.rejected);
  const preparing = open.filter(({ tab }) => !tab.delivery.cancelled && !tab.delivery.rejected);
  const late = preparing.filter(({ t }) => minutesSince(t.at, now) >= 15).length;
  const visible = items.filter(({ tab, t }) => (!status || ((tab.delivery.cancelled || tab.delivery.rejected) ? status === "iptal" : t.status === status)) && (!query.trim() || normalizeSearchText([tabLabel(tab, tables, PLATFORM_NAMES), ...t.lineIds.map(id => tab.lines.find(l => l.lineId === id)?.name ?? "")].join(" ")).includes(normalizeSearchText(query.trim()))));
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageIndex = Math.min(page, pages - 1);
  return (
    <div {...mainProps} className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 outline-none">
      <p ref={announcementRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="kitchen-heading" tabIndex={-1} className="rounded-sm font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Mutfak</h1>
          <div role={loaded ? undefined : "status"} aria-live={loaded ? undefined : "polite"} className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">{loaded ? <><span>{preparing.length} bekleyen · {ready.length} hazır</span>{late > 0 && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">{late} geciken</span>}{cancelledCount > 0 && <span className="text-xs text-bad">{cancelledCount} son iptal</span>}</> : "Siparişler yükleniyor…"}</div>
        </div>
        {filter.length > 0 && <span className="max-w-full break-words text-right text-xs text-muted">İstasyon filtresi: {filter.map((id) => stations.find((station) => station.id === id)?.name ?? "İstasyon bulunamadı").join(", ")}</span>}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
        <div role="group" aria-label="Mutfak görünümü" className="flex gap-1">{([["detay", "Ayrıntılı"], ["kompakt", "Kompakt"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={layout === key} onClick={() => { setLayout(key); setPage(0); }} className={`press min-h-11 rounded-lg border px-3 font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${layout === key ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>{label}</button>)}</div>
        <label className="grid gap-1 text-xs text-muted">Yazı boyutu<select value={textSize} onChange={e => setTextSize(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60"><option value="normal">Normal</option><option value="buyuk">Büyük</option></select></label>
        {compact && <>
          <label className="grid min-w-0 flex-1 basis-full gap-1 text-xs text-muted sm:basis-[12rem]">Mutfakta ara<input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Masa, paket veya ürün" className="min-h-11 min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" /></label>
          <label className="grid gap-1 text-xs text-muted">Aşama<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60"><option value="">Tümü</option><option value="yeni">Yeni</option><option value="hazirlaniyor">Hazırlanıyor</option><option value="hazir">Hazır</option><option value="iptal">Son iptaller</option></select></label>
          <label className="grid gap-1 text-xs text-muted">Sayfada<select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} className="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{[6, 12, 18, 24].map(n => <option key={n} value={n}>{n} bilet</option>)}</select></label>
        </>}
      </div>
      {actionError && <p className="mb-4 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad" role="alert" aria-live="assertive">{actionError}</p>}
      {compact ? <section aria-label="Kompakt mutfak" aria-busy={!loaded || undefined} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><p role="status" aria-live="polite">{loaded ? `${visible.length} bilet · Sayfa ${pageIndex + 1} / ${pages}` : "Biletler yükleniyor…"}</p><div className="flex gap-2"><button type="button" disabled={!loaded || pageIndex === 0} onClick={() => setPage(pageIndex - 1)} className="min-h-11 rounded-lg border border-line bg-surface px-3 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40">Önceki</button><button type="button" disabled={!loaded || pageIndex + 1 >= pages} onClick={() => setPage(pageIndex + 1)} className="min-h-11 rounded-lg border border-line bg-surface px-3 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40">Sonraki</button></div></div>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] items-start gap-3">{loaded && visible.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).map(card)}</div>
        {loaded && !visible.length && <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Bu filtrelerle eşleşen bilet yok.</p>}
      </section> : <div aria-busy={!loaded || undefined} className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {!loaded ? <p className="self-center rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted lg:col-span-2" aria-hidden="true">Siparişler yükleniyor…</p> : <>
        <section aria-label="Bekleyen siparişler" className="min-h-0 overflow-y-auto">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">{cancelledCount ? "Bekleyen ve son iptaller" : "Bekleyen"} <span className="tabular rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">{open.length}</span></h2>
          {open.length === 0 ? <p className="rounded-2xl border-2 border-dashed border-line-strong p-12 text-center text-sm text-muted">Bekleyen sipariş yok.</p> : <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{open.map(card)}</div>}
        </section>
        <section aria-label="Hazır" className="min-h-0 space-y-3 overflow-y-auto rounded-2xl bg-surface-3/60 p-3">
          <h2 className="flex items-center gap-2 font-semibold text-ok"><span className="size-2 rounded-full bg-ok" />Hazır <span className="tabular rounded-full bg-ok-soft px-2 py-0.5 text-xs">{ready.length}</span></h2>
          {ready.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Hazır sipariş yok.</p>}
          {ready.map(card)}
        </section>
        </>}
      </div>}
    </div>
  );
}
