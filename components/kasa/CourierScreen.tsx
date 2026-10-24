"use client";
// Kurye ekranı (kuryenin kendi telefonu): üzerine atanan paketler, toplu "Yola çıktım", "Teslim ettim" (tahsilat yöntemi) → satış + delivered.
// Üzerindeki nakit = teslim edilen nakit siparişler; "Hesap kapat" kasiyer/müdür PIN'iyle gün sonuna gider (KasaApp).
import { useEffect, useRef, useState } from "react";
import { kasaFmt } from "./kasa-format";
import { deliveryStatus, type PayIntent, type TabState } from "@/lib/core/tab";
import { istToday } from "@/lib/core/report";
import { courierCash, formatPhone, intentLabel, phoneHref, PAY_INTENTS } from "@/lib/core/delivery";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import type { Cashier } from "./PinPad";
import { Modal } from "./TabScreen";
import { minutesSince } from "./useTabs";
import { useKasaMainProps } from "./KasaPreviewContext";
import { CourierLocationShare } from "./CourierLocationShare";
import { beep } from "./beep";

const btn = "press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-medium shadow-card outline-none hover:border-line-strong hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40";
const strong = "press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] bg-espresso px-3 py-2 text-sm font-medium text-white shadow-card outline-none hover:bg-espresso-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40";
export function CourierScreen({ meta, courier, tabs, tabsLoaded = true, now, add, onDeliver, onCloseShift }: {
  meta: Meta; courier: Cashier; tabs: Map<string, TabState>; tabsLoaded?: boolean; now: number; add: (list: NewTabEvent[]) => Promise<unknown>;
  onDeliver: (tab: TabState, method: PayIntent) => Promise<void>; onCloseShift: () => void;
}) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt(meta);
  const [busy, setBusy] = useState<"out" | "deliver" | null>(null);
  const [deliver, setDeliver] = useState<TabState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const busyRef = useRef(false);
  const lastActionButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!error || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const retry = lastActionButtonRef.current;
      if (retry?.isConnected && !retry.disabled) retry.focus();
      else actionErrorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, error]);
  useEffect(() => {
    if (!notice || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const action = lastActionButtonRef.current;
      if (action?.isConnected && !action.disabled) action.focus();
      else document.getElementById("courier-heading")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, notice]);
  const zones = meta.catalog.deliveryZones ?? [];
  const todayStart = Date.parse(`${istToday(now)}T00:00:00+03:00`);
  const mine = [...tabs.values()].filter((t) => t.kind === "paket" && t.delivery.courierId === courier.id && !t.delivery.cancelled);
  const active = mine.filter((t) => !t.delivery.deliveredAt).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const done = mine.filter((t) => t.delivery.deliveredAt && Date.parse(t.delivery.deliveredAt) >= todayStart);
  const waiting = active.filter((t) => !t.delivery.outAt && deliveryStatus(t) === "hazir");
  const hasOutForDelivery = active.some((t) => t.delivery.outAt);
  const cash = courierCash(done, courier.id);
  const previousReady = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!tabsLoaded) return;
    const current = new Set(active.filter(t => deliveryStatus(t) === "hazir").map(t => t.id));
    if (previousReady.current && [...current].some(id => !previousReady.current!.has(id))) beep(true);
    previousReady.current = current;
  }, [active, tabsLoaded]);
  const run = async (action: "out" | "deliver", fn: () => Promise<unknown>, success: string) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    setNotice("");
    try {
      await fn();
      setNotice(success);
      setDeliver(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem tamamlanamadı. Tekrar deneyin.");
      return false;
    } finally { busyRef.current = false; setBusy(null); }
  };
  const out = () => run("out", () => add(waiting.map((t) => ({ tabId: t.id, tableId: null, staffId: courier.id, ev: { type: "out" as const } }))), "Siparişler yola çıktı olarak kaydedildi.");

  return (
    <div {...mainProps} className="mx-auto w-full max-w-lg px-4 py-5 outline-none">
      <div className="mb-4 flex items-center gap-3">
        <h1 id="courier-heading" tabIndex={-1} className="min-w-0 break-words rounded-sm font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Siparişlerim <span className="tabular text-muted">({tabsLoaded ? active.length : "—"})</span></h1>
        {tabsLoaded && waiting.length > 0 && <button type="button" disabled={busy !== null} aria-busy={busy === "out" || undefined} onClick={(e) => { lastActionButtonRef.current = e.currentTarget; void out(); }} className={`ml-auto shrink-0 ${strong}`}>{busy === "out" ? "Yola çıkış kaydediliyor…" : `Yola çıktım (${waiting.length})`}</button>}
      </div>
      {"id" in mainProps && <CourierLocationShare staffId={courier.id} />}
      {!tabsLoaded && <p className="sr-only" role="status" aria-live="polite">Kurye siparişleri yükleniyor.</p>}
      {error && !deliver && <p ref={actionErrorRef} tabIndex={-1} className="mb-3 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{error}</p>}
      {busy && busy !== "deliver" && <p className="sr-only" role="status" aria-live="polite">Siparişlerin yola çıkışı kaydediliyor.</p>}
      {notice && <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{notice}</p>}
      <ul aria-busy={!tabsLoaded || undefined} className="space-y-3">
        {!tabsLoaded ? <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted" aria-hidden="true">Siparişler yükleniyor…</li> : <>
        {active.map((t) => {
          const o = t.order;
          const st = deliveryStatus(t);
          const zone = zones.find((z) => z.id === o?.zoneId);
          const addr = [o?.address, zone?.name].filter(Boolean).join(", ");
          const phone = o?.phone ? phoneHref(o.phone) : null;
          return (
            <li key={t.id} data-testid="courier-card" className="rounded-xl border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <span className="min-w-0 flex-1 break-words font-semibold">{o?.name ?? "Paket"}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${st === "yolda" ? "bg-info-soft text-info" : st === "hazir" ? "bg-ok-soft text-ok" : "bg-surface-3 text-ink-2"}`}>
                  {st === "yolda" ? "Yolda" : st === "hazir" ? "Hazır" : "Hazırlanıyor"}
                </span>
                <span className="ml-auto shrink-0 tabular text-xs text-muted">{minutesSince(t.openedAt, now)} dk</span>
              </div>
              {o && <div className="mt-1 break-words">{o.address}</div>}
              {o?.directions && <div className="break-words text-xs text-muted">{o.directions}</div>}
              {o?.note && <div className="mt-1 break-words text-xs font-medium text-warn">Not: {o.note}</div>}
              <div className="mt-2 flex items-center gap-2">
                <span className="tabular text-base font-semibold">{TL(t.remaining)}</span>
                {o && <span className="text-xs text-muted">{intentLabel(o.payIntent)}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {addr && <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" aria-label={`Haritada aç: ${o?.name ?? "Paket"}, ${zone?.name ?? o?.address ?? "adres"}; yeni sekmede açılır`} className={btn}>Harita</a>}
                {phone && o?.phone && <a href={phone} aria-label={`Ara ${o.name ?? "müşteri"}, ${formatPhone(o.phone)}`} className={btn}>Ara {formatPhone(o.phone)}</a>}
                {t.delivery.outAt && <button type="button" disabled={busy !== null} onClick={() => { setError(null); setDeliver(t); }} className={`ml-auto ${strong}`}>Teslim ettim</button>}
              </div>
            </li>
          );
        })}
        {!active.length && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">Üzerinizde sipariş yok.</li>}
        </>}
      </ul>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 text-sm">
        <div className="flex items-baseline justify-between">
          <span>Bugün teslim: <span className="tabular font-medium">{tabsLoaded ? done.length : "—"}</span></span>
          <span>Bugün tahsil edilen nakit: <span className="tabular font-display text-base font-bold" data-testid="courier-cash">{tabsLoaded ? TL(cash) : "—"}</span></span>
        </div>
        <button type="button" disabled={busy !== null || !tabsLoaded || hasOutForDelivery} aria-describedby={!tabsLoaded ? "courier-shift-loading" : hasOutForDelivery ? "courier-shift-blocked" : undefined} onClick={onCloseShift} className={`mt-3 w-full ${btn}`}>Hesap kapat (kasiyer onayı)</button>
        {!tabsLoaded && <p id="courier-shift-loading" className="mt-2 text-xs text-muted">Siparişler yüklenmeden hesap kapatılamaz.</p>}
        {hasOutForDelivery && <p id="courier-shift-blocked" className="mt-2 text-xs text-muted">Yoldaki siparişler teslim edilmeden hesap kapatılamaz.</p>}
      </section>

      {deliver && (
        <Modal label="Nasıl ödendi?" onClose={() => setDeliver(null)} closeDisabled={busy !== null} statusMessage={busy === "deliver" ? "Teslimat ve ödeme kaydediliyor." : ""}>
          <p className="mb-3 text-sm">{deliver.order?.name} · <span className="tabular font-semibold">{TL(deliver.remaining)}</span></p>
          {deliver.order?.payIntent && <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">Sipariş tercihi: <b className="text-ink">{intentLabel(deliver.order.payIntent)}</b>. Lütfen teslimde gerçekte tahsil edilen yöntemi seçin.</p>}
          {error && <p ref={actionErrorRef} tabIndex={-1} className="mb-3 break-words rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            {PAY_INTENTS.map((p) => (
              <button key={p.value} type="button" disabled={busy !== null} onClick={(e) => { lastActionButtonRef.current = e.currentTarget; void run("deliver", () => onDeliver(deliver, p.value), `Teslimat ${p.label.toLocaleLowerCase("tr-TR")} olarak kaydedildi.`); }}
                className={`${btn} ${deliver.order?.payIntent === p.value ? "border-brand font-medium text-brand" : ""}`}>{busy === "deliver" ? "Teslimat kaydediliyor…" : p.label}</button>
            ))}
          </div>
          <button type="button" disabled={busy !== null} onClick={() => setDeliver(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40">Vazgeç</button>
        </Modal>
      )}
    </div>
  );
}
