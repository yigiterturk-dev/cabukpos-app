"use client";
// Paket panosu: paket + platform siparişleri durum sütunlarında. Kabul/red (platform), kurye ata, kuryeye verildi, iptal (müdür).
// Her işlem bir adisyon olayıdır; kurye tahsilatı kurye telefonunda (CourierScreen), gel-al paket kasada "Hesap" ile.
import { useEffect, useRef, useState } from "react";
import { kasaFmt } from "./kasa-format";
import { deliveryStatus, openDeliveries, tabLabel, type DeliveryStatus, type TabState } from "@/lib/core/tab";
import { PLATFORM_NAMES, sendByStation } from "@/lib/core/platform";
import { etaMinutes, formatPhone, intentLabel } from "@/lib/core/delivery";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { Modal, type Waiter } from "./TabScreen";
import { PinPad } from "./PinPad";
import { minutesSince } from "./useTabs";
import { beep } from "./beep";
import { useKasaMainProps } from "./KasaPreviewContext";
import { DeliveryOperations } from "./DeliveryOperations";
import { courierSummary, deliveryTimes, dispatchFilter, isDeliveryActive, readyDispatchEvents } from "@/lib/core/dispatch";
import { istToday } from "@/lib/core/report";
import { StatCard } from "@/components/ui";
import { DeliveryConnections } from "./DeliveryConnections";
import { DeliverySoundControls, ALERT_VALUES, REPEAT_KEY } from "./DeliverySoundControls";
import { useKasaSetting } from "./useKasaSetting";

type Add = (list: NewTabEvent[]) => Promise<unknown>;
const EMPTY_TABLES: NonNullable<Meta["catalog"]["tables"]> = [];
const deadlineInfo = (tab: TabState) => {
  const raw = tab.order?.source?.deadline;
  const at = raw ? Date.parse(raw) : NaN;
  return { provided: Boolean(raw), at: Number.isFinite(at) ? at : null };
};
const announce = (node: HTMLElement | null, frame: { current: number | null }, message: string) => {
  if (!node) return;
  if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  node.textContent = "";
  frame.current = window.requestAnimationFrame(() => {
    frame.current = null;
    if (node.isConnected) node.textContent = message;
  });
};

const COLUMNS: { key: DeliveryStatus[]; title: string }[] = [
  { key: ["onay_bekliyor"], title: "Onay bekliyor" },
  { key: ["hazirlaniyor"], title: "Hazırlanıyor" },
  { key: ["hazir"], title: "Hazır" },
  { key: ["yolda"], title: "Yolda" },
  { key: ["teslim", "iptal", "reddedildi"], title: "Teslim ve kapananlar" },
];
const PREP = [10, 20, 30, 45];
const REJECT = ["Ürün kalmadı", "Yoğunluk", "Kapalıyız", "Adres bölge dışı"];
const STATUS_CHIP: Record<DeliveryStatus, string> = {
  onay_bekliyor: "bg-bad-soft text-bad",
  hazirlaniyor: "bg-warn-soft text-warn",
  hazir: "bg-ok-soft text-ok",
  yolda: "bg-info-soft text-info",
  teslim: "bg-surface-3 text-muted",
  iptal: "bg-bad-soft text-bad",
  reddedildi: "bg-bad-soft text-bad",
};
const STATUS_LABEL: Record<DeliveryStatus, string> = {
  onay_bekliyor: "Onay bekliyor",
  hazirlaniyor: "Hazırlanıyor",
  hazir: "Hazır",
  yolda: "Yolda",
  teslim: "Teslim edildi",
  iptal: "İptal",
  reddedildi: "Reddedildi",
};

const btn = "press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-medium shadow-card outline-none hover:border-line-strong hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40";
const strong = "press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] bg-brand-action px-3 py-2 text-sm font-medium text-white shadow-card outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40";

type Dialog = { k: "accept" | "reject" | "courier" | "cancel"; tab: TabState };

export function DeliveryBoard({ meta, onMeta, tabs, now, add, waiter, onNew, onOpen, onBill, onHandover, loaded = false }: {
  meta: Meta; onMeta: (m: Meta) => void; tabs: Map<string, TabState>; now: number; add: Add; waiter: Waiter;
  onNew: () => void; onOpen: (tabId: string) => void; onBill: (tabId: string) => void; onHandover: (tab: TabState) => Promise<void>; loaded?: boolean;
}) {
  const mainProps = useKasaMainProps();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [view, setView] = useState<"board" | "orders" | "couriers">("board");
  const [query, setQuery] = useState("");
  const [autoAssign, setAutoAssign] = useState(false);
  const [repeatAlert] = useKasaSetting(REPEAT_KEY, ALERT_VALUES, "acik");
  const [soundAlert] = useKasaSetting("sesli_uyari", ALERT_VALUES, "acik");
  const { TL } = kasaFmt(meta);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const lastActionRef = useRef<HTMLElement | null>(null);
  const actionErrorRef = useRef<HTMLParagraphElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const announcementFrameRef = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousWaitingRef = useRef<Set<string> | null>(null);
  useEffect(() => () => {
    if (announcementFrameRef.current !== null) window.cancelAnimationFrame(announcementFrameRef.current);
  }, []);
  useEffect(() => {
    if (!actionError || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const retry = lastActionRef.current;
      if (retry?.isConnected && !retry.matches(":disabled")) retry.focus();
      else actionErrorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionError, busy]);
  const list = openDeliveries(tabs, now);
  const tables = meta.catalog.tables ?? EMPTY_TABLES;
  const zones = meta.catalog.deliveryZones ?? [];
  const couriers = meta.catalog.staff.filter((s) => s.role === "kurye");
  const loads = courierSummary(tabs.values(), couriers, istToday(now), now);
  const matches = new Set(dispatchFilter(list, { query }).map(t => t.id));
  const unassigned = list.filter(t => t.kind === "paket" && isDeliveryActive(t) && !t.delivery.courierId).length;
  const staffName = (id: string | null) => meta.catalog.staff.find((s) => s.id === id)?.name ?? null;
  const waiting = list.filter((t) => deliveryStatus(t) === "onay_bekliyor").length;
  const active = list.filter((t) => !["teslim", "iptal", "reddedildi"].includes(deliveryStatus(t))).length;
  const closed = list.length - active;
  // #39: geçmiş teslimlerden bölge bazlı ETA (yolda→teslim dk medyanı).
  const samples = [...tabs.values()].flatMap((t) => (t.delivery.outAt && t.delivery.deliveredAt ? [{ zoneId: t.order?.zoneId ?? null, minutes: (Date.parse(t.delivery.deliveredAt) - Date.parse(t.delivery.outAt)) / 60_000 }] : []));
  const etaFor = (t: TabState) => {
    const eta = etaMinutes(samples, t.order?.zoneId ?? null);
    return eta != null && t.delivery.outAt ? Math.max(0, Math.ceil((Date.parse(t.delivery.outAt) + eta * 60_000 - now) / 60_000)) : null;
  };

  useEffect(() => {
    if (!loaded) return;
    const current = new Map(list.filter((tab) => deliveryStatus(tab) === "onay_bekliyor").map((tab) => [tab.id, tab]));
    const previous = previousWaitingRef.current;
    if (previous) {
      const added = [...current].filter(([id]) => !previous.has(id)).map(([, tab]) => tab);
      if (added.length) beep(true);
      if (added.length && announcementRef.current) {
        const messages = added.slice(0, 3).map((tab) => `Yeni onay bekleyen sipariş: ${tabLabel(tab, tables, PLATFORM_NAMES)}.`);
        announce(announcementRef.current, announcementFrameRef, messages.join(" ") + (added.length > 3 ? ` Ayrıca ${added.length - 3} yeni sipariş daha.` : ""));
      }
    } else if (current.size) beep(true);
    previousWaitingRef.current = new Set(current.keys());
  }, [loaded, list, tables]);

  // Onay bekleyen platform siparişi varken 4 sn'de bir ses.
  useEffect(() => {
    if (!waiting || repeatAlert !== "acik" || soundAlert !== "acik") return;
    const t = setInterval(() => beep(true), 4000);
    return () => clearInterval(t);
  }, [waiting, repeatAlert, soundAlert]);
  const ev = (tab: TabState, e: NewTabEvent["ev"], approvedBy: string | null = null, approvalToken?: string): NewTabEvent => ({ tabId: tab.id, tableId: null, staffId: waiter.id, approvedBy, approvalToken, ev: e });
  const openDialog = (next: Dialog) => { setActionError(null); setDialog(next); };
  const run = async (fn: () => Promise<unknown>, successNotice: string, actionKey = "dialog", pendingNotice = "Sipariş güncelleniyor.", focusOrderId?: string) => {
    if (busyRef.current) return;
    lastActionRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    busyRef.current = true;
    setBusy(true);
    setPendingAction(actionKey);
    setPendingMessage(pendingNotice);
    setActionError(null);
    try {
      await fn();
      announce(announcementRef.current, announcementFrameRef, successNotice);
      setDialog(null);
      if (focusOrderId) requestAnimationFrame(() => {
        const card = [...(boardRef.current?.querySelectorAll<HTMLElement>("[data-order-id]") ?? [])].find((node) => node.dataset.orderId === focusOrderId);
        (card ?? boardHeadingRef.current)?.focus();
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "İşlem tamamlanamadı. Tekrar deneyin.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPendingAction(null);
      setPendingMessage("");
    }
  };
  const accept = (tab: TabState, prepMin: number) => {
    const unsent = tab.lines.filter((l) => !l.sent && !l.voided);
    return run(() => add([ev(tab, { type: "accept", prepMin }), ...sendByStation(unsent, () => crypto.randomUUID()).map((s) => ev(tab, s))]), "Sipariş kabul edildi ve mutfağa gönderildi.", `accept:${tab.id}:${prepMin}`, `${prepMin} dk hazırlama süresiyle sipariş kabul edilip mutfağa gönderiliyor.`, tab.id);
  };

  return (
    <div {...mainProps} ref={boardRef} className="flex min-h-0 flex-1 flex-col p-4 outline-none">
      <p ref={announcementRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      {pendingMessage && !dialog && <p className="sr-only" role="status" aria-live="polite">{pendingMessage}</p>}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h2 ref={boardHeadingRef} tabIndex={-1} className="font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Paket ve sevkiyat</h2>
          <p role={loaded ? undefined : "status"} aria-live={loaded ? undefined : "polite"} className="mt-0.5 text-sm text-muted">{loaded ? `${active} aktif · ${closed} teslim / kapanan` : "Siparişler yükleniyor…"}</p>
        </div>
        {waiting > 0 && <span className="rounded-full bg-bad-action px-2.5 py-0.5 text-xs font-medium text-white" data-testid="waiting-count">{waiting} onay bekliyor</span>}
        <button type="button" onClick={onNew} className="press ml-auto inline-flex min-h-12 items-center rounded-xl bg-brand-action px-4 text-sm font-semibold text-white shadow-rest ring-1 ring-inset ring-white/15 outline-none hover:bg-brand-action-hover hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60">+ Yeni paket</button>
      </div>
      {view === "board" && <DeliveryConnections meta={meta} preview={!("id" in mainProps)} />}
      {view === "board" && <DeliverySoundControls />}
      {view === "board" && <label className="mb-4 flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-sm"><input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} disabled={!couriers.length} className="size-5 accent-brand" /><span>Hazır düğmesinde en az aktif işi olan kuryeye ata <span className="text-xs text-muted">· bu oturumda, işletmenin paket siparişleri için</span></span></label>}
      {view === "board" && <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Onay bekliyor" value={loaded ? String(waiting) : "—"} tone={waiting ? "warn" : "neutral"} />
        <StatCard label="Hazır" value={loaded ? String(list.filter(t => deliveryStatus(t) === "hazir").length) : "—"} tone="ok" />
        <StatCard label="Yolda" value={loaded ? String(list.filter(t => deliveryStatus(t) === "yolda").length) : "—"} tone="info" />
        <StatCard label="Kurye atanmamış" value={loaded ? String(unassigned) : "—"} hint="İşletmenin paket siparişleri" tone={unassigned ? "warn" : "neutral"} />
      </div>}
      <div role="group" aria-label="Paket yönetimi görünümü" className="mb-4 flex flex-wrap gap-2">
        {([["board", "Canlı akış"], ["orders", "Sipariş listesi"], ["couriers", "Kurye yönetimi"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`${btn} ${view === key ? "border-brand bg-brand-soft text-brand" : ""}`}>{label}</button>)}
        {view === "board" && <label className="ml-auto flex min-w-0 items-center gap-2 text-sm text-muted">Ara<input aria-label="Canlı paketlerde ara" value={query} onChange={e => setQuery(e.target.value)} placeholder="Müşteri, telefon, ürün…" className="min-h-12 min-w-0 rounded-xl border border-line bg-surface px-3 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" /></label>}
      </div>
      {view !== "board" && <DeliveryOperations meta={meta} tabs={tabs} now={now} view={view} onOpen={onOpen} preview={!("id" in mainProps)} />}
      {actionError && !dialog && <p ref={actionErrorRef} tabIndex={-1} className="mb-4 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{actionError}</p>}
      {view === "board" && <div aria-busy={!loaded || undefined} className="grid min-w-0 gap-3 md:min-h-0 md:flex-1 md:grid-cols-[repeat(5,minmax(260px,1fr))] md:overflow-x-auto md:pb-3">
        {!loaded ? <div className="col-span-full min-h-24" aria-hidden="true" /> : list.length === 0 ? (
          <p className="col-span-full self-center rounded-2xl border border-dashed border-line-strong bg-surface-2/40 p-8 text-center text-sm text-muted">Henüz paket veya platform siparişi yok. Yeni siparişler geldikçe burada görünecek.</p>
        ) : COLUMNS.map((c) => {
          const cards = list.filter((t) => matches.has(t.id) && c.key.includes(deliveryStatus(t))).sort((a, b) => {
            if (c.key[0] === "onay_bekliyor") {
              const aDeadline = deadlineInfo(a).at ?? Number.POSITIVE_INFINITY;
              const bDeadline = deadlineInfo(b).at ?? Number.POSITIVE_INFINITY;
              if (aDeadline !== bDeadline) return aDeadline - bDeadline;
            }
            return a.openedAt.localeCompare(b.openedAt);
          });
          return (
            <section key={c.title} aria-label={c.title} className="min-w-0 rounded-2xl bg-surface-3/70 p-2 md:flex md:min-h-0 md:flex-col">
              <h3 className="mb-2 min-w-0 break-words px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{c.title} <span className="tabular">({cards.length})</span></h3>
              <ul className="space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
                {cards.map((t) => {
                  const st = deliveryStatus(t);
                  const o = t.order;
                  const orderLabel = tabLabel(t, tables, PLATFORM_NAMES);
                  const zone = zones.find((z) => z.id === o?.zoneId);
                  const courier = staffName(t.delivery.courierId);
                  const deadline = deadlineInfo(t);
                  const deadlineRemaining = deadline.at === null ? null : Math.ceil((deadline.at - now) / 60_000);
                  const closed = st === "teslim" || st === "iptal" || st === "reddedildi";
                  const ageFrom = closed && t.closedAt ? t.closedAt : t.openedAt;
                  return (
                    <li key={t.id} data-testid="delivery-card" data-order-id={t.id} tabIndex={-1} className={`min-w-0 rounded-xl border bg-surface p-3 text-sm shadow-card outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${st === "onay_bekliyor" ? "border-bad/40 ring-2 ring-bad-soft" : "border-line"} ${closed ? "opacity-70" : ""}`}>
                      <button type="button" aria-label={`${orderLabel}, ${STATUS_LABEL[st]} sipariş ayrıntıları`} disabled={closed} onClick={() => onOpen(t.id)} className="block w-full rounded-lg text-left outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-default">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate font-semibold" title={orderLabel}>{orderLabel}</span>
                          <span className="ml-auto shrink-0 tabular text-xs text-muted">{closed && t.closedAt ? "Kapanalı " : ""}{minutesSince(ageFrom, now)} dk</span>
                        </div>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[st]}`}>{STATUS_LABEL[st]}</span>
                        {o && <div className="truncate text-ink-2" title={t.kind === "platform" ? o.name : formatPhone(o.phone)}>{t.kind === "platform" ? o.name : formatPhone(o.phone)}</div>}
                        {o && <div className="truncate text-xs text-muted" title={[zone?.name, o.address].filter(Boolean).join(" · ")}>{[zone?.name, o.address].filter(Boolean).join(" · ")}</div>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="tabular font-display text-base font-bold">{TL(t.total)}</span>
                          {o && <span className="text-xs text-muted">{intentLabel(o.payIntent)}</span>}
                        </div>
                        {courier && <div className="mt-1 break-words text-xs">Kurye: <span className="font-medium">{courier}</span></div>}
                        {deliveryTimes(t, now).late && <p className="mt-1 text-xs font-semibold text-bad">Hazırlık süresi aşıldı</p>}
                        {t.remaining > 0 && st === "teslim" && <p className="mt-1 text-xs font-semibold text-warn">Açık hesap: {TL(t.remaining)}</p>}
                        {st === "yolda" && (() => { const e = etaFor(t); return e != null ? <div className={`mt-1 text-xs font-medium ${e === 0 ? "text-warn" : "text-ink-2"}`} data-testid="eta">{e === 0 ? "Tahmini teslim süresi aşıldı" : `Tahmini teslim ~${e} dk`}</div> : null; })()}
                        {st === "onay_bekliyor" && deadline.provided && <div className={`mt-1 text-xs font-medium ${deadlineRemaining === null || deadlineRemaining <= 2 ? "text-bad" : "text-warn"}`}>
                          {deadlineRemaining === null ? "Onay süresi bilgisi okunamadı" : deadlineRemaining <= 0 ? "Onay süresi doldu" : `Onay için ${deadlineRemaining} dk`}
                        </div>}
                        {st === "iptal" && <div className="mt-1 break-words text-xs text-bad">İptal: {t.delivery.cancelled}</div>}
                        {st === "reddedildi" && <div className="mt-1 break-words text-xs text-bad">Red: {t.delivery.rejected}</div>}
                      </button>
                      {!closed && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {st === "onay_bekliyor" ? (
                            <>
                              <button type="button" aria-label={`Kabul: ${orderLabel}`} disabled={busy} onClick={() => openDialog({ k: "accept", tab: t })} className={strong}>Kabul</button>
                              <button type="button" aria-label={`Red: ${orderLabel}`} disabled={busy} onClick={() => openDialog({ k: "reject", tab: t })} className={btn}>Red</button>
                            </>
                          ) : st !== "yolda" && (
                            <>
                              {st === "hazirlaniyor" && <button type="button" aria-label={`Hazır: ${orderLabel}`} disabled={busy} onClick={() => void run(() => add(readyDispatchEvents(t, tabs.values(), couriers, autoAssign, () => crypto.randomUUID(), now).map(event => ev(t, event))), "Sipariş hazır olarak kaydedildi.", `ready:${t.id}`, "Sipariş hazır olarak kaydediliyor.", t.id)} className={strong}>Hazır</button>}
                              {st === "hazir" && t.kind === "paket" && t.delivery.courierId && <button type="button" aria-label={`Yola çıkar: ${orderLabel}`} disabled={busy} onClick={() => void run(() => add([ev(t, { type: "out" })]), "Sipariş yola çıktı olarak kaydedildi.", `out:${t.id}`, "Yola çıkış kaydediliyor.", t.id)} className={strong}>Yola çıkar</button>}
                              {t.kind === "paket" && couriers.length > 0 && <button type="button" aria-label={`${courier ? "Kurye değiştir" : "Kurye ata"}: ${orderLabel}`} disabled={busy} onClick={() => openDialog({ k: "courier", tab: t })} className={btn}>{courier ? "Kurye değiştir" : "Kurye ata"}</button>}
                              {t.kind === "platform" && <button type="button" aria-label={`${pendingAction === `handover:${t.id}` ? "Kurye teslimi kaydediliyor" : "Kuryeye verildi"}: ${orderLabel}`} disabled={busy} aria-busy={pendingAction === `handover:${t.id}` || undefined} onClick={() => void run(() => onHandover(t), "Sipariş kurye teslimine verildi.", `handover:${t.id}`, "Sipariş kurye teslimine veriliyor.", t.id)} className={strong}>{pendingAction === `handover:${t.id}` ? "Kurye teslimi kaydediliyor…" : "Kuryeye verildi"}</button>}
                              {t.kind === "paket" && !t.delivery.courierId && <button type="button" aria-label={`Hesap (gel-al): ${orderLabel}`} disabled={busy || t.remaining === 0} onClick={() => onBill(t.id)} className={btn}>Hesap (gel-al)</button>}
                            </>
                          )}
                          {st !== "onay_bekliyor" && t.paid === 0 && <button type="button" aria-label={`İptal: ${orderLabel}`} disabled={busy} onClick={() => openDialog({ k: "cancel", tab: t })} className="inline-flex min-h-12 items-center rounded-lg px-3 py-1.5 text-xs text-bad underline outline-none focus-visible:ring-4 focus-visible:ring-bad/30">İptal</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
                {!cards.length && <li className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Bu aşamada sipariş yok.</li>}
              </ul>
            </section>
          );
        })}
      </div>}

      {dialog?.k === "accept" && (
        <Modal label="Hazırlama süresi" onClose={() => setDialog(null)} closeDisabled={busy} statusMessage={pendingMessage}>
          <p className="mb-1 font-medium">{tabLabel(dialog.tab, tables, PLATFORM_NAMES)} · {TL(dialog.tab.total)}</p>
          <p className="mb-4 text-sm text-muted">Siparişi kabul edip mutfağa göndermek için tahmini hazırlama süresini seçin.</p>
          {actionError && <p ref={actionErrorRef} tabIndex={-1} className="mb-3 break-words rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{actionError}</p>}
          <div className="grid grid-cols-4 gap-2">
            {PREP.map((m) => <button key={m} type="button" disabled={busy} aria-busy={pendingAction === `accept:${dialog.tab.id}:${m}` || undefined} onClick={() => void accept(dialog.tab, m)} className={btn}>{pendingAction === `accept:${dialog.tab.id}:${m}` ? "Gönderiliyor…" : `${m} dk`}</button>)}
          </div>
            <button type="button" disabled={busy} onClick={() => setDialog(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "reject" && (
        <Modal label="Red sebebi" onClose={() => setDialog(null)} closeDisabled={busy} statusMessage={pendingMessage}>
          <p className="mb-4 text-sm text-muted">{tabLabel(dialog.tab, tables, PLATFORM_NAMES)} siparişi reddedilecek. Nedeni seçin; bu bilgi işlem kaydına eklenir.</p>
          {actionError && <p ref={actionErrorRef} tabIndex={-1} className="mb-3 break-words rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{actionError}</p>}
          <div className="grid gap-2">
            {REJECT.map((r) => <button key={r} type="button" disabled={busy} aria-busy={pendingAction === `reject:${dialog.tab.id}:${r}` || undefined} onClick={() => void run(() => add([ev(dialog.tab, { type: "reject", reason: r })]), "Sipariş reddedildi.", `reject:${dialog.tab.id}:${r}`, `Sipariş “${r}” gerekçesiyle reddediliyor.`, dialog.tab.id)} className={btn}>{pendingAction === `reject:${dialog.tab.id}:${r}` ? "Gönderiliyor…" : r}</button>)}
          </div>
            <button type="button" disabled={busy} onClick={() => setDialog(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "courier" && (
        <Modal label="Kurye ata" onClose={() => setDialog(null)} closeDisabled={busy} statusMessage={pendingMessage}>
          <p className="mb-4 text-sm text-muted">{tabLabel(dialog.tab, tables, PLATFORM_NAMES)} için kuryeyi seçin. En az aktif işi olan kurye önce gösterilir.</p>
          {actionError && <p ref={actionErrorRef} tabIndex={-1} className="mb-3 break-words rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{actionError}</p>}
          <div role="group" aria-label="Kurye seçimi" className="grid gap-2">
            {[...couriers].sort((a, b) => (loads.find(c => c.id === a.id)?.active ?? 0) - (loads.find(c => c.id === b.id)?.active ?? 0)).map((c) => (
              <button key={c.id} type="button" aria-pressed={dialog.tab.delivery.courierId === c.id} disabled={busy} aria-busy={pendingAction === `courier:${dialog.tab.id}:${c.id}` || undefined} onClick={() => void run(() => add([ev(dialog.tab, { type: "courier", staffId: c.id })]), `${c.name} kurye olarak atandı.`, `courier:${dialog.tab.id}:${c.id}`, `${c.name} siparişe atanıyor.`, dialog.tab.id)}
                className={`${btn} ${dialog.tab.delivery.courierId === c.id ? "border-brand font-medium text-brand" : ""}`}>{pendingAction === `courier:${dialog.tab.id}:${c.id}` ? "Atanıyor…" : `${c.name} · ${loads.find(load => load.id === c.id)?.active ?? 0} aktif iş`}</button>
            ))}
            {dialog.tab.delivery.courierId && <button type="button" disabled={busy} aria-busy={pendingAction === `courier:${dialog.tab.id}:remove` || undefined} onClick={() => void run(() => add([ev(dialog.tab, { type: "courier", staffId: null })]), "Siparişten kurye ataması kaldırıldı.", `courier:${dialog.tab.id}:remove`, "Kurye ataması kaldırılıyor.", dialog.tab.id)} className={btn}>{pendingAction === `courier:${dialog.tab.id}:remove` ? "Kaldırılıyor…" : "Kuryeyi kaldır"}</button>}
          </div>
            <button type="button" disabled={busy} onClick={() => setDialog(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "cancel" && <CancelDialog meta={meta} onMeta={onMeta} waiter={waiter} busy={busy} error={actionError} errorRef={actionErrorRef} statusMessage={pendingMessage} onClose={() => setDialog(null)} onOk={(by, reason, token) => run(() => add([ev(dialog.tab, { type: "cancel", reason }, by, token)]), "Sipariş iptal edildi.", "dialog", "Sipariş güncelleniyor.", dialog.tab.id)} />}
    </div>
  );
}

/** İptal: gerekçe + müdür değilse müdür PIN'i. */
function CancelDialog({ meta, onMeta, waiter, busy, error, errorRef, statusMessage, onOk, onClose }: { meta: Meta; onMeta: (m: Meta) => void; waiter: Waiter; busy: boolean; error?: string | null; errorRef: React.RefObject<HTMLParagraphElement | null>; statusMessage: string; onOk: (approvedBy: string | null, reason: string, approvalToken?: string) => void | Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(false);
  const reasonInvalid = reason.trim().length > 0 && reason.trim().length < 2;
  return (
    <Modal label="Siparişi iptal et" onClose={onClose} closeDisabled={busy} statusMessage={statusMessage}>
      {!pin ? (
        <>
          {error && <p ref={errorRef} tabIndex={-1} className="mb-3 break-words rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{error}</p>}
          <label className="mb-4 block text-sm"><span className="mb-1 block font-medium">Gerekçe</span><input autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} aria-invalid={reasonInvalid || undefined} aria-describedby="delivery-cancel-reason-hint" className={`min-h-12 w-full rounded-[10px] border bg-surface px-3 py-2 outline-none focus:ring-4 ${reasonInvalid ? "border-bad focus:ring-bad/30" : "border-line focus:border-brand focus:ring-brand-ring/50"}`} /><span id="delivery-cancel-reason-hint" className={`mt-1 block text-xs ${reasonInvalid ? "text-bad" : "text-muted"}`}>{reasonInvalid ? "İptal gerekçesi en az 2 karakter olmalı." : "İptal gerekçesi kayda eklenir; en az 2 karakter girin."}</span></label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
            <button type="button" disabled={busy || reason.trim().length < 2} onClick={() => (waiter.role === "mudur" ? onOk(null, reason.trim()) : setPin(true))} className="inline-flex min-h-12 flex-[2] items-center justify-center rounded-lg bg-bad-action px-4 py-2 text-sm font-medium text-white outline-none hover:bg-bad-action-hover focus-visible:ring-4 focus-visible:ring-bad/30 disabled:opacity-40">{busy ? "Gönderiliyor…" : waiter.role === "mudur" ? "İptal et" : "Müdür onayına"}</button>
          </div>
        </>
      ) : (
        <>
          {error && <p ref={errorRef} tabIndex={-1} className="mb-3 break-words rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{error}</p>}
          <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m, token) => onOk(m.id, reason.trim(), token)} autoFocusFirst />
            <button type="button" disabled={busy} onClick={onClose} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40 mt-4 w-full">Vazgeç</button>
        </>
      )}
    </Modal>
  );
}
