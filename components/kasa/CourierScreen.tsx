"use client";
// Kurye ekranı (kuryenin kendi telefonu): üzerine atanan paketler, toplu "Yola çıktım", "Teslim ettim" (tahsilat yöntemi) → satış + delivered.
// Üzerindeki nakit = teslim edilen nakit siparişler; "Hesap kapat" kasiyer/müdür PIN'iyle gün sonuna gider (KasaApp).
import { useState } from "react";
import { formatTL } from "@/lib/core/money";
import { deliveryStatus, type PayIntent, type TabState } from "@/lib/core/tab";
import { courierCash, formatPhone, intentLabel, PAY_INTENTS } from "@/lib/core/delivery";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import type { Cashier } from "./PinPad";
import { Modal } from "./TabScreen";
import { minutesSince } from "./useTabs";

const btn = "press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-medium shadow-card hover:border-line-strong hover:bg-surface-2 disabled:opacity-40";
const strong = "press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-ink px-3 py-2 text-sm font-medium text-white shadow-card hover:bg-ink-2 disabled:opacity-40";

export function CourierScreen({ meta, courier, tabs, now, add, onDeliver, onCloseShift }: {
  meta: Meta; courier: Cashier; tabs: Map<string, TabState>; now: number; add: (list: NewTabEvent[]) => Promise<unknown>;
  onDeliver: (tab: TabState, method: PayIntent) => Promise<void>; onCloseShift: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deliver, setDeliver] = useState<TabState | null>(null);
  const zones = meta.catalog.deliveryZones ?? [];
  const mine = [...tabs.values()].filter((t) => t.kind === "paket" && t.delivery.courierId === courier.id && !t.delivery.cancelled);
  const active = mine.filter((t) => !t.delivery.deliveredAt).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const done = mine.filter((t) => t.delivery.deliveredAt && Date.parse(t.delivery.deliveredAt) > now - 16 * 3600_000);
  const waiting = active.filter((t) => !t.delivery.outAt);
  const cash = courierCash(done, courier.id);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); setDeliver(null); } };
  const out = () => run(() => add(waiting.map((t) => ({ tabId: t.id, tableId: null, staffId: courier.id, ev: { type: "out" as const } }))));

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-5">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Siparişlerim <span className="tabular text-muted">({active.length})</span></h1>
        {waiting.length > 0 && <button type="button" disabled={busy} onClick={() => void out()} className={`ml-auto ${strong}`}>Yola çıktım ({waiting.length})</button>}
      </div>
      <ul className="space-y-3">
        {active.map((t) => {
          const o = t.order;
          const st = deliveryStatus(t);
          const zone = zones.find((z) => z.id === o?.zoneId);
          const addr = [o?.address, zone?.name].filter(Boolean).join(", ");
          return (
            <li key={t.id} data-testid="courier-card" className="rounded-xl border border-line bg-surface p-4 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">{o?.name ?? "Paket"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${st === "yolda" ? "bg-sky-50 text-sky-800" : st === "hazir" ? "bg-ok-soft text-ok" : "bg-surface-3 text-ink-2"}`}>
                  {st === "yolda" ? "Yolda" : st === "hazir" ? "Hazır" : "Hazırlanıyor"}
                </span>
                <span className="ml-auto tabular text-xs text-muted">{minutesSince(t.openedAt, now)} dk</span>
              </div>
              {o && <div className="mt-1">{o.address}</div>}
              {o?.directions && <div className="text-xs text-muted">{o.directions}</div>}
              {o?.note && <div className="mt-1 text-xs font-medium text-warn">Not: {o.note}</div>}
              <div className="mt-2 flex items-center gap-2">
                <span className="tabular text-base font-semibold">{formatTL(t.remaining)}</span>
                {o && <span className="text-xs text-muted">{intentLabel(o.payIntent)}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {addr && <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className={btn}>Harita</a>}
                {o?.phone && <a href={`tel:+${o.phone}`} className={btn}>Ara {formatPhone(o.phone)}</a>}
                {t.delivery.outAt && <button type="button" disabled={busy} onClick={() => setDeliver(t)} className={`ml-auto ${strong}`}>Teslim ettim</button>}
              </div>
            </li>
          );
        })}
        {!active.length && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">Üzerinizde sipariş yok.</li>}
      </ul>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 text-sm">
        <div className="flex items-baseline justify-between">
          <span>Bugün teslim: <span className="tabular font-medium">{done.length}</span></span>
          <span>Üzerimdeki nakit: <span className="tabular font-semibold" data-testid="courier-cash">{formatTL(cash)}</span></span>
        </div>
        <button type="button" disabled={busy || active.some((t) => t.delivery.outAt)} onClick={onCloseShift} className={`mt-3 w-full ${btn}`}>Hesap kapat (kasiyer onayı)</button>
      </section>

      {deliver && (
        <Modal label="Nasıl ödendi?" onClose={() => setDeliver(null)}>
          <p className="mb-3 text-sm">{deliver.order?.name} · <span className="tabular font-semibold">{formatTL(deliver.remaining)}</span></p>
          <div className="grid grid-cols-2 gap-2">
            {PAY_INTENTS.map((p) => (
              <button key={p.value} type="button" disabled={busy} onClick={() => void run(() => onDeliver(deliver, p.value))}
                className={`${btn} ${deliver.order?.payIntent === p.value ? "border-brand font-medium text-brand" : ""}`}>{p.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setDeliver(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
    </main>
  );
}
