"use client";
// Paket panosu: paket + platform siparişleri durum sütunlarında. Kabul/red (platform), kurye ata, kuryeye verildi, iptal (müdür).
// Her işlem bir adisyon olayıdır; kurye tahsilatı kurye telefonunda (CourierScreen), gel-al paket kasada "Hesap" ile.
import { useEffect, useState } from "react";
import { formatTL } from "@/lib/core/money";
import { deliveryStatus, openDeliveries, tabLabel, type DeliveryStatus, type TabState } from "@/lib/core/tab";
import { PLATFORM_NAMES, sendByStation } from "@/lib/core/platform";
import { etaMinutes, formatPhone, intentLabel } from "@/lib/core/delivery";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { Modal, type Waiter } from "./TabScreen";
import { PinPad } from "./PinPad";
import { minutesSince } from "./useTabs";
import { beep } from "./beep";

type Add = (list: NewTabEvent[]) => Promise<unknown>;

const COLUMNS: { key: DeliveryStatus[]; title: string }[] = [
  { key: ["onay_bekliyor"], title: "Onay bekliyor" },
  { key: ["hazirlaniyor"], title: "Hazırlanıyor" },
  { key: ["hazir"], title: "Hazır" },
  { key: ["yolda"], title: "Yolda" },
  { key: ["teslim", "iptal", "reddedildi"], title: "Bugün kapanan" },
];
const PREP = [10, 20, 30, 45];
const REJECT = ["Ürün kalmadı", "Yoğunluk", "Kapalıyız", "Adres bölge dışı"];

const btn = "press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-white px-3 py-2 text-sm font-medium shadow-card hover:border-line-strong hover:bg-surface-2 disabled:opacity-40";
const strong = "press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-ink px-3 py-2 text-sm font-medium text-white shadow-card hover:bg-ink-2 disabled:opacity-40";

type Dialog = { k: "accept" | "reject" | "courier" | "cancel"; tab: TabState };

export function DeliveryBoard({ meta, onMeta, tabs, now, add, waiter, onNew, onOpen, onBill, onHandover }: {
  meta: Meta; onMeta: (m: Meta) => void; tabs: Map<string, TabState>; now: number; add: Add; waiter: Waiter;
  onNew: () => void; onOpen: (tabId: string) => void; onBill: (tabId: string) => void; onHandover: (tab: TabState) => Promise<void>;
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const list = openDeliveries(tabs, now);
  const tables = meta.catalog.tables ?? [];
  const zones = meta.catalog.deliveryZones ?? [];
  const couriers = meta.catalog.staff.filter((s) => s.role === "kurye");
  const staffName = (id: string | null) => meta.catalog.staff.find((s) => s.id === id)?.name ?? null;
  const waiting = list.filter((t) => deliveryStatus(t) === "onay_bekliyor").length;
  // #39: geçmiş teslimlerden bölge bazlı ETA (yolda→teslim dk medyanı).
  const samples = [...tabs.values()].flatMap((t) => (t.delivery.outAt && t.delivery.deliveredAt ? [{ zoneId: t.order?.zoneId ?? null, minutes: (Date.parse(t.delivery.deliveredAt) - Date.parse(t.delivery.outAt)) / 60_000 }] : []));
  const etaFor = (t: TabState) => {
    const eta = etaMinutes(samples, t.order?.zoneId ?? null);
    return eta != null && t.delivery.outAt ? Math.max(0, Math.ceil((Date.parse(t.delivery.outAt) + eta * 60_000 - now) / 60_000)) : null;
  };

  // Onay bekleyen platform siparişi varken 4 sn'de bir ses.
  useEffect(() => {
    if (!waiting) return;
    beep(true);
    const t = setInterval(() => beep(true), 4000);
    return () => clearInterval(t);
  }, [waiting]);

  const ev = (tab: TabState, e: NewTabEvent["ev"], approvedBy: string | null = null): NewTabEvent => ({ tabId: tab.id, tableId: null, staffId: waiter.id, approvedBy, ev: e });
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); setDialog(null); } };
  const accept = (tab: TabState, prepMin: number) => {
    const unsent = tab.lines.filter((l) => !l.sent && !l.voided);
    return run(() => add([ev(tab, { type: "accept", prepMin }), ...sendByStation(unsent, () => crypto.randomUUID()).map((s) => ev(tab, s))]));
  };

  return (
    <div className="flex-1 p-4">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Paket siparişleri</h2>
        {waiting > 0 && <span className="animate-pulse rounded-full bg-bad px-2.5 py-0.5 text-xs font-medium text-white" data-testid="waiting-count">{waiting} onay bekliyor</span>}
        <button type="button" onClick={onNew} className="press ml-auto inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-card hover:bg-brand-hover">+ Yeni paket</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-3">
        {COLUMNS.map((c) => {
          const cards = list.filter((t) => c.key.includes(deliveryStatus(t)));
          if (c.key[0] === "onay_bekliyor" && !cards.length) return <div key={c.title} className="hidden lg:block" />;
          return (
            <section key={c.title} aria-label={c.title} className="min-w-0 rounded-2xl bg-surface-3/70 p-2">
              <h3 className="mb-2 px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{c.title} <span className="tabular">({cards.length})</span></h3>
              <ul className="space-y-2">
                {cards.map((t) => {
                  const st = deliveryStatus(t);
                  const o = t.order;
                  const zone = zones.find((z) => z.id === o?.zoneId);
                  const courier = staffName(t.delivery.courierId);
                  const deadline = o?.source?.deadline ? Math.ceil((Date.parse(o.source.deadline) - now) / 60_000) : null;
                  const closed = st === "teslim" || st === "iptal" || st === "reddedildi";
                  return (
                    <li key={t.id} data-testid="delivery-card" className={`rounded-xl border bg-white p-3 text-sm shadow-card ${st === "onay_bekliyor" ? "border-bad/40 ring-2 ring-bad-soft" : "border-line"} ${closed ? "opacity-70" : ""}`}>
                      <button type="button" onClick={() => !closed && onOpen(t.id)} className="block w-full text-left">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold">{tabLabel(t, tables, PLATFORM_NAMES)}</span>
                          <span className="ml-auto tabular text-xs text-muted">{minutesSince(t.openedAt, now)} dk</span>
                        </div>
                        {o && <div className="truncate text-ink-2">{t.kind === "platform" ? o.name : formatPhone(o.phone)}</div>}
                        {o && <div className="truncate text-xs text-muted">{[zone?.name, o.address].filter(Boolean).join(" · ")}</div>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="tabular font-semibold">{formatTL(t.total)}</span>
                          {o && <span className="text-xs text-muted">{intentLabel(o.payIntent)}</span>}
                        </div>
                        {courier && <div className="mt-1 text-xs">Kurye: <span className="font-medium">{courier}</span></div>}
                        {st === "yolda" && (() => { const e = etaFor(t); return e != null ? <div className="mt-1 text-xs font-medium text-ink-2" data-testid="eta">Tahmini teslim ~{e} dk</div> : null; })()}
                        {st === "onay_bekliyor" && deadline !== null && <div className={`mt-1 text-xs font-medium ${deadline <= 2 ? "text-bad" : "text-warn"}`}>Onay için {Math.max(0, deadline)} dk</div>}
                        {st === "iptal" && <div className="mt-1 text-xs text-bad">İptal: {t.delivery.cancelled}</div>}
                        {st === "reddedildi" && <div className="mt-1 text-xs text-bad">Red: {t.delivery.rejected}</div>}
                      </button>
                      {!closed && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {st === "onay_bekliyor" ? (
                            <>
                              <button type="button" disabled={busy} onClick={() => setDialog({ k: "accept", tab: t })} className={strong}>Kabul</button>
                              <button type="button" disabled={busy} onClick={() => setDialog({ k: "reject", tab: t })} className={btn}>Red</button>
                            </>
                          ) : st !== "yolda" && (
                            <>
                              {t.kind === "paket" && couriers.length > 0 && <button type="button" disabled={busy} onClick={() => setDialog({ k: "courier", tab: t })} className={btn}>{courier ? "Kurye değiştir" : "Kurye ata"}</button>}
                              {t.kind === "platform" && <button type="button" disabled={busy} onClick={() => void run(() => onHandover(t))} className={strong}>Kuryeye verildi</button>}
                              {t.kind === "paket" && !t.delivery.courierId && <button type="button" disabled={busy || t.remaining === 0} onClick={() => onBill(t.id)} className={btn}>Hesap (gel-al)</button>}
                            </>
                          )}
                          {st !== "onay_bekliyor" && t.paid === 0 && <button type="button" disabled={busy} onClick={() => setDialog({ k: "cancel", tab: t })} className="rounded-lg px-2 py-1.5 text-xs text-bad underline">İptal</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
                {!cards.length && <li className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">—</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {dialog?.k === "accept" && (
        <Modal label="Hazırlama süresi" onClose={() => setDialog(null)}>
          <div className="grid grid-cols-4 gap-2">
            {PREP.map((m) => <button key={m} type="button" disabled={busy} onClick={() => void accept(dialog.tab, m)} className={btn}>{m} dk</button>)}
          </div>
          <button type="button" onClick={() => setDialog(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "reject" && (
        <Modal label="Red sebebi" onClose={() => setDialog(null)}>
          <div className="grid gap-2">
            {REJECT.map((r) => <button key={r} type="button" disabled={busy} onClick={() => void run(() => add([ev(dialog.tab, { type: "reject", reason: r })]))} className={btn}>{r}</button>)}
          </div>
          <button type="button" onClick={() => setDialog(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "courier" && (
        <Modal label="Kurye ata" onClose={() => setDialog(null)}>
          <div className="grid gap-2">
            {couriers.map((c) => (
              <button key={c.id} type="button" aria-pressed={dialog.tab.delivery.courierId === c.id} disabled={busy} onClick={() => void run(() => add([ev(dialog.tab, { type: "courier", staffId: c.id })]))}
                className={`${btn} ${dialog.tab.delivery.courierId === c.id ? "border-brand font-medium text-brand" : ""}`}>{c.name}</button>
            ))}
            {dialog.tab.delivery.courierId && <button type="button" disabled={busy} onClick={() => void run(() => add([ev(dialog.tab, { type: "courier", staffId: null })]))} className={btn}>Kuryeyi kaldır</button>}
          </div>
          <button type="button" onClick={() => setDialog(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "cancel" && <CancelDialog meta={meta} onMeta={onMeta} waiter={waiter} onClose={() => setDialog(null)} onOk={(by, reason) => void run(() => add([ev(dialog.tab, { type: "cancel", reason }, by)]))} />}
    </div>
  );
}

/** İptal: gerekçe + müdür değilse müdür PIN'i. */
function CancelDialog({ meta, onMeta, waiter, onOk, onClose }: { meta: Meta; onMeta: (m: Meta) => void; waiter: Waiter; onOk: (approvedBy: string | null, reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState(false);
  return (
    <Modal label="Siparişi iptal et" onClose={onClose}>
      {!pin ? (
        <>
          <label className="mb-4 block text-sm"><span className="mb-1 block font-medium">Gerekçe</span><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="w-full rounded-[10px] border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
            <button type="button" disabled={reason.trim().length < 2} onClick={() => (waiter.role === "mudur" ? onOk(null, reason.trim()) : setPin(true))} className="flex-[2] rounded-lg bg-bad px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{waiter.role === "mudur" ? "İptal et" : "Müdür onayına"}</button>
          </div>
        </>
      ) : (
        <>
          <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m) => onOk(m.id, reason.trim())} />
          <button type="button" onClick={onClose} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </>
      )}
    </Modal>
  );
}
