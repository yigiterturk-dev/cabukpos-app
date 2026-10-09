"use client";
// Masa adisyonu: ürün ızgarası (seçenek penceresi), adisyon satırları, mutfağa gönder, taşı, ikram/indirim/iptal (müdür onayı), hesap.
// Her dokunuş bir adisyon olayıdır (yerel + giden kutusu) → çökmede kaybolmaz, diğer cihazlara akışla gider.
import { useState } from "react";
import { parseMoney, type Currency } from "@/lib/core/money";
import { kasaFmt } from "./kasa-format";
import { optionsText, validateOptions, type OptionGroup } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import { lineGross, mergeCandidates, mergeableLines, openTabsByTable, type TabLine, type TabState } from "@/lib/core/tab";
import { sendByStation } from "@/lib/core/platform";
import { FEE_NAME, formatPhone, intentLabel, zoneCheck } from "@/lib/core/delivery";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { KasaProduct, KasaStaff, Meta, Table } from "@/lib/offline/state";
import { PinPad } from "./PinPad";
import { Dialog } from "@/components/ui";
import { categoryTone } from "@/lib/ui/categoryTone";
import { minutesSince } from "./useTabs";

type Add = (list: NewTabEvent[]) => Promise<unknown>;
export type Waiter = { id: string; name: string; role: KasaStaff["role"] };

export function Modal({ label, children, onClose }: { label: string; children: React.ReactNode; onClose: () => void }) {
  return <Dialog label={label} title={label} onClose={onClose}>{children}</Dialog>;
}

const btn = "press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-medium shadow-card hover:border-line-strong hover:bg-surface-2 disabled:opacity-40";
const strong = "press inline-flex min-h-11 items-center justify-center rounded-[10px] bg-ink px-3 text-sm font-medium text-white shadow-card hover:bg-ink-2";
const chip = (on: boolean) => `press inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap ${on ? "border-brand bg-brand text-white shadow-card" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`;
const primary = "press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow-card hover:bg-brand-hover disabled:opacity-40";

function OptionsDialog({ product, groups, onAdd, onClose, currency }: { product: KasaProduct; groups: OptionGroup[]; onAdd: (unitPrice: number, options: { id: string; name: string; delta: number }[], note: string | null, qtyMilli: number) => void; onClose: () => void; currency?: Currency }) {
  const { TL } = kasaFmt({ device: { currency } });
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const r = validateOptions(product.price, groups, picked);
  const toggle = (g: OptionGroup, id: string) => setPicked((p) => {
    if (p.includes(id)) return p.filter((x) => x !== id);
    const inGroup = p.filter((x) => g.options.some((o) => o.id === x));
    return g.max === 1 ? [...p.filter((x) => !inGroup.includes(x)), id] : inGroup.length >= g.max ? p : [...p, id];
  });
  return (
    <Modal label={product.name} onClose={onClose}>
      {groups.map((g) => (
        <fieldset key={g.id} className="mb-4">
          <legend className="mb-2 text-sm font-medium">{g.name} <span className="font-normal text-muted">{g.min > 0 ? "(zorunlu)" : ""}{g.max > 1 ? ` en çok ${g.max}` : ""}</span></legend>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => (
              <button key={o.id} type="button" aria-pressed={picked.includes(o.id)} onClick={() => toggle(g, o.id)} className={`rounded-lg border px-3 py-2 text-sm ${picked.includes(o.id) ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>
                {o.name}{o.delta ? ` ${o.delta > 0 ? "+" : "−"}${TL(Math.abs(o.delta))}` : ""}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="mb-4 block text-sm"><span className="mb-1 block font-medium">Not</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ör. soğansız" className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
      <div className="mb-4 flex items-center gap-3">
        <button type="button" aria-label="Azalt" onClick={() => setQty((q) => Math.max(1, q - 1))} className={btn}>−</button>
        <span className="tabular w-8 text-center text-lg font-semibold">{qty}</span>
        <button type="button" aria-label="Artır" onClick={() => setQty((q) => Math.min(99, q + 1))} className={btn}>+</button>
        <span className="tabular ml-auto font-semibold">{r.ok ? TL(r.unitPrice * qty) : ""}</span>
      </div>
      {!r.ok && picked.length > 0 && <p className="mb-2 text-sm text-bad">{r.error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
        <button type="button" disabled={!r.ok} onClick={() => r.ok && onAdd(r.unitPrice, r.options, note.trim() || null, qty * 1000)} className={`flex-[2] ${primary}`}>Ekle</button>
      </div>
    </Modal>
  );
}

/** Gerekçe (+ indirimde tutar) ve müdür değilse müdür PIN'i. */
function ApprovalDialog({ meta, onMeta, waiter, title, discount, onOk, onClose }: {
  meta: Meta; onMeta: (m: Meta) => void; waiter: Waiter; title: string; discount?: boolean;
  onOk: (approvedBy: string | null, reason: string, d?: { percent: number | null; amount: number | null }) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"yuzde" | "tutar" | "kaldir">("yuzde");
  const [value, setValue] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");
  const pct = Number(value), amt = parseMoney(value);
  const d = !discount ? undefined : kind === "kaldir" ? { percent: null, amount: null } : kind === "yuzde" ? { percent: Number.isInteger(pct) && pct >= 1 && pct <= 100 ? pct : NaN, amount: null } : { percent: null, amount: amt ?? NaN };
  const valid = reason.trim().length >= 2 || kind === "kaldir" && discount;
  const dValid = !d || (d.percent === null || !Number.isNaN(d.percent)) && (d.amount === null || !Number.isNaN(d.amount));
  const next = () => (waiter.role === "mudur" ? onOk(null, reason.trim(), d) : setStep("pin"));
  return (
    <Modal label={title} onClose={onClose}>
      {step === "form" ? (
        <>
          {discount && (
            <div className="mb-4">
              <div className="mb-2 flex gap-1">
                {([["yuzde", "Yüzde"], ["tutar", "Tutar (TL)"], ["kaldir", "İndirimi kaldır"]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-lg border px-3 py-2 text-sm ${kind === k ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>{l}</button>
                ))}
              </div>
              {kind !== "kaldir" && <input aria-label={kind === "yuzde" ? "İndirim yüzdesi" : "İndirim tutarı"} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="tabular w-full rounded-lg border border-line px-3 py-2 text-right" />}
            </div>
          )}
          <label className="mb-4 block text-sm"><span className="mb-1 block font-medium">Gerekçe</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          {waiter.role !== "mudur" && <p className="mb-3 text-sm text-muted">Müdür onayı gerekir.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
            <button type="button" disabled={!valid || !dValid} onClick={next} className={`flex-[2] ${primary}`}>{waiter.role === "mudur" ? "Onayla" : "Müdür onayına"}</button>
          </div>
        </>
      ) : (
        <>
          <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m) => onOk(m.id, reason.trim(), d)} />
          <button type="button" onClick={onClose} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </>
      )}
    </Modal>
  );
}

type Dialog =
  | { k: "options"; product: KasaProduct }
  | { k: "line"; line: TabLine }
  | { k: "approve"; title: string; discount?: boolean; run: (approvedBy: string | null, reason: string, d?: { percent: number | null; amount: number | null }) => NewTabEvent[] }
  | { k: "note"; line: TabLine }
  | { k: "move" }
  | { k: "merge" };

/** table null → paket/platform adisyonu (M6): taşı/hesap iste yok, sipariş bilgisi üstte, ilk gönderimde paket fişi (onFirstSend). */
export function TabScreen({ meta, onMeta, table, title, tabs, allTabs, waiter, canPay, add, now, onBill, onBack, onFirstSend }: {
  meta: Meta; onMeta: (m: Meta) => void; table: Table | null; title: string; tabs: TabState[]; allTabs: Map<string, TabState>; waiter: Waiter; canPay: boolean; add: Add; now: number;
  onBill: (tabId: string) => void; onBack: () => void; onFirstSend?: (tab: TabState) => void;
}) {
  const { TL } = kasaFmt(meta);
  const [newTabId] = useState(() => crypto.randomUUID());
  const [pick, setPick] = useState<string | null>(null);
  const tab = tabs.find((t) => t.id === pick) ?? tabs[0] ?? null;
  const tabId = tab?.id ?? newTabId;
  const [cat, setCat] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const cats = meta.catalog.categories;
  const groups = meta.catalog.optionGroups ?? [];
  const tables = meta.catalog.tables ?? [];
  const products = meta.catalog.products.filter((p) => p.kind === "adet" && (cat === null || p.categoryId === cat));
  const ev = (e: NewTabEvent["ev"], approvedBy: string | null = null): NewTabEvent => ({ tabId, tableId: table?.id ?? null, staffId: waiter.id, approvedBy, ev: e });
  const run = async (list: NewTabEvent[]) => { setBusy(true); try { await add(list); } finally { setBusy(false); setDialog(null); } };

  const addLine = (p: KasaProduct, unitPrice: number, options: { id: string; name: string; delta: number }[], note: string | null, qtyMilli: number) =>
    run([...(tab ? [] : [ev({ type: "open", guests: 0 })]), ev({ type: "add", lineId: crypto.randomUUID(), productId: p.id, name: p.name, unitPrice, vatRate: p.vatRate, qtyMilli, options, note, stationId: p.stationId ?? null })]);
  const tapProduct = (p: KasaProduct) => {
    const gs = (p.optionGroupIds ?? []).map((id) => groups.find((g) => g.id === id)).filter((g): g is OptionGroup => Boolean(g));
    if (gs.length) setDialog({ k: "options", product: p });
    else void addLine(p, p.price, [], null, 1000);
  };

  const live = tab?.lines.filter((l) => !l.voided) ?? [];
  const unsent = live.filter((l) => !l.sent && l.productId !== null);
  const send = () => {
    const first = tab && tab.tickets.length === 0;
    // Serbest satır (paket ücreti) mutfağa gitmez
    const lines = unsent.filter((l) => l.productId !== null);
    void run(sendByStation(lines, () => crypto.randomUUID()).map((s) => ev(s))).then(() => { if (first && tab) onFirstSend?.(tab); });
  };
  const order = tab?.order ?? null;
  const zone = order?.zoneId ? meta.catalog.deliveryZones?.find((z) => z.id === order.zoneId) ?? null : null;
  const subtotal = live.filter((l) => !l.comped && l.name !== FEE_NAME).reduce((a, l) => a + lineGross(l), 0);
  const belowMin = !table && zoneCheck(zone, subtotal).belowMin;
  const ready = tab?.tickets.filter((k) => k.status === "hazir") ?? [];
  const occupied = openTabsByTable(allTabs);

  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_24rem]">
      <section className="p-4">
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setCat(null)} className={chip(cat === null)}>Tümü</button>
          {cats.map((c) => <button key={c.id} type="button" onClick={() => setCat(c.id)} className={chip(cat === c.id)}><span aria-hidden className={`size-2.5 rounded-full ${categoryTone(c.id).dot}`} />{c.name}</button>)}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {products.map((p) => (
            <button key={p.id} type="button" disabled={busy} onClick={() => tapProduct(p)} className="press relative flex min-h-24 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-3.5 pt-4 text-left shadow-card hover:border-line-strong">
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${categoryTone(p.categoryId).stripe}`} />
              <span className="line-clamp-2 font-semibold leading-snug">{p.name}</span>
              <span className="tabular mt-auto pt-2 text-sm font-medium text-ink-2">{TL(p.price)}{p.optionGroupIds?.length ? " ⋯" : ""}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="flex flex-col border-l border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <button type="button" onClick={onBack} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 -ml-2">← {table ? "Salon" : "Paket"}</button>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {tab && <span className="text-sm text-muted">{minutesSince(tab.openedAt, now)} dk</span>}
          {tabs.length > 1 && (
            <div className="ml-auto flex gap-1">
              {tabs.map((t, i) => <button key={t.id} type="button" aria-pressed={t.id === tabId} onClick={() => setPick(t.id)} className={`rounded px-2 py-1 text-xs ${t.id === tabId ? "bg-brand text-white" : "border border-line bg-surface"}`}>Adisyon {i + 1}</button>)}
            </div>
          )}
        </div>
        {order && (
          <div className="border-b border-line px-3 py-2 text-sm" data-testid="order-info">
            <div className="font-medium">{order.name} · <span className="tabular">{formatPhone(order.phone)}</span></div>
            <div className="text-ink-2">{order.address}{order.directions ? ` · ${order.directions}` : ""}</div>
            <div className="text-xs text-muted">{[zone?.name, intentLabel(order.payIntent), order.note].filter(Boolean).join(" · ")}</div>
            {belowMin && zone && <div className="mt-1 text-xs font-medium text-warn">Asgari tutar {TL(zone.minOrder)} altında</div>}
          </div>
        )}
        <ul className="flex-1 divide-y divide-line overflow-y-auto" aria-label="Adisyon">
          {!tab && <li className="p-6 text-center text-sm text-muted">Boş masa. Ürüne dokunarak sipariş açın.</li>}
          {tab?.lines.map((l) => {
            const k = tab.tickets.find((t) => t.lineIds.includes(l.lineId));
            return (
              <li key={l.lineId}>
                <button type="button" disabled={l.voided} onClick={() => setDialog({ k: "line", line: l })} className={`flex w-full items-start gap-2 px-3 py-2 text-left ${l.voided ? "text-muted line-through" : ""}`}>
                  <span className="tabular w-8 font-semibold">{qtyText(l.qtyMilli)}×</span>
                  <span className="flex-1">
                    <span className="block">{l.name}</span>
                    {l.options.length > 0 && <span className="block text-xs text-muted">{optionsText(l.options)}</span>}
                    {l.note && <span className="block text-xs text-warn">! {l.note}</span>}
                    <span className="mt-0.5 flex gap-1 text-[11px]">
                      {!l.sent && !l.voided && l.productId !== null && <span className="rounded bg-warn-soft px-1.5 text-warn">gönderilmedi</span>}
                      {k && <span className={`rounded px-1.5 ${k.status === "hazir" ? "bg-ok text-white" : "bg-surface-3"}`}>{{ yeni: "mutfakta", hazirlaniyor: "hazırlanıyor", hazir: "hazır", teslim: "teslim" }[k.status]}</span>}
                      {l.comped && <span className="rounded bg-sky-100 px-1.5 text-sky-800">ikram</span>}
                      {l.paidMilli > 0 && <span className="rounded bg-surface-3 px-1.5">ödendi {qtyText(l.paidMilli)}</span>}
                    </span>
                  </span>
                  <span className="tabular">{l.comped ? TL(0) : TL(lineGross(l))}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {tab && (
          <div className="space-y-2 border-t border-line bg-surface-2 p-3">
            {tab.discountAmount > 0 && <div className="flex justify-between text-sm"><span>İndirim</span><span className="tabular">−{TL(tab.discountAmount)}</span></div>}
            {tab.paid > 0 && <div className="flex justify-between text-sm"><span>Ödenen</span><span className="tabular">−{TL(tab.paid)}</span></div>}
            <div className="flex items-baseline justify-between"><span className="text-sm font-medium text-ink-2">Kalan</span><span className="tabular text-3xl font-bold tracking-tight" data-testid="tab-remaining">{TL(tab.remaining)}</span></div>
            {tab.remaining === 0 && live.length > 0 && live.every((l) => l.comped || l.paidMilli >= l.qtyMilli) && (
              <button type="button" onClick={() => void run([ev({ type: "close", reason: "ödenecek tutar yok" })]).then(onBack)} className={`w-full ${strong}`}>Masayı kapat</button>
            )}
            {ready.length > 0 && <button type="button" onClick={() => void run(ready.map((k) => ev({ type: "kitchen", ticketId: k.id, status: "teslim" })))} className="press min-h-11 w-full rounded-[10px] bg-ok text-sm font-medium text-white shadow-card">Hazır — teslim edildi</button>}
            <div className="grid grid-cols-3 gap-2">
              {table && <button type="button" onClick={() => setDialog({ k: "move" })} className={btn}>Taşı</button>}
              {table && <button type="button" onClick={() => setDialog({ k: "merge" })} className={btn}>Birleştir</button>}
              <button type="button" onClick={() => setDialog({ k: "approve", title: "Adisyon indirimi", discount: true, run: (by, reason, d) => [ev({ type: "discount", percent: d!.percent, amount: d!.amount, reason }, by)] })} className={btn}>İndirim</button>
              {!canPay && table && <button type="button" disabled={tab.billRequested} onClick={() => void run([ev({ type: "bill" })])} className={btn}>{tab.billRequested ? "Hesap istendi" : "Hesap iste"}</button>}
              {canPay && <button type="button" disabled={tab.remaining === 0 && live.every((l) => l.comped || l.paidMilli >= l.qtyMilli)} onClick={() => onBill(tab.id)} className={`${btn} font-medium`}>Hesap</button>}
            </div>
          </div>
        )}
        <div className="border-t border-line bg-surface-2 p-3 pt-0">
          <button type="button" disabled={!unsent.length || busy} onClick={send} className={`min-h-14 w-full text-lg ${primary}`}>Mutfağa gönder{unsent.length ? ` (${unsent.length})` : ""}</button>
        </div>
      </aside>

      {dialog?.k === "options" && (
        <OptionsDialog product={dialog.product} currency={meta.device?.currency} groups={(dialog.product.optionGroupIds ?? []).map((id) => groups.find((g) => g.id === id)).filter((g): g is OptionGroup => Boolean(g))}
          onClose={() => setDialog(null)} onAdd={(unit, opts, note, q) => void addLine(dialog.product, unit, opts, note, q)} />
      )}
      {dialog?.k === "line" && (
        <Modal label={dialog.line.name} onClose={() => setDialog(null)}>
          <div className="grid gap-2">
            {!dialog.line.sent ? (
              <>
                <button type="button" onClick={() => void run([ev({ type: "void", lineId: dialog.line.lineId, reason: "gönderilmeden silindi" })])} className={btn}>Sil</button>
                <button type="button" onClick={() => setDialog({ k: "note", line: dialog.line })} className={btn}>Not ekle / değiştir</button>
              </>
            ) : dialog.line.paidMilli === 0 && (
              <button type="button" onClick={() => { const l = dialog.line; setDialog({ k: "approve", title: `İptal: ${l.name}`, run: (by, reason) => [ev({ type: "void", lineId: l.lineId, reason }, by)] }); }} className={btn}>İptal et (müdür onayı)</button>
            )}
            {!dialog.line.comped && dialog.line.paidMilli === 0 && (
              <button type="button" onClick={() => { const l = dialog.line; setDialog({ k: "approve", title: `İkram: ${l.name}`, run: (by, reason) => [ev({ type: "comp", lineId: l.lineId, reason }, by)] }); }} className={btn}>İkram et</button>
            )}
            <button type="button" onClick={() => setDialog(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-2 w-full">Kapat</button>
          </div>
        </Modal>
      )}
      {dialog?.k === "note" && <NoteDialog line={dialog.line} onClose={() => setDialog(null)} onSave={(note) => {
        const l = dialog.line; // not = satırı sil + aynısını notla yeniden ekle (gönderilmemiş satır)
        void run([ev({ type: "void", lineId: l.lineId, reason: "not değişti" }), ev({ type: "add", lineId: crypto.randomUUID(), productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, options: l.options, note, stationId: l.stationId })]);
      }} />}
      {dialog?.k === "approve" && (
        <ApprovalDialog meta={meta} onMeta={onMeta} waiter={waiter} title={dialog.title} discount={dialog.discount} onClose={() => setDialog(null)} onOk={(by, reason, d) => void run(dialog.run(by, reason, d))} />
      )}
      {dialog?.k === "move" && table && (
        <Modal label={`${table.name} → taşı`} onClose={() => setDialog(null)}>
          <div className="grid grid-cols-4 gap-2">
            {tables.filter((t) => t.id !== table.id && !occupied.has(t.id)).map((t) => (
              <button key={t.id} type="button" onClick={() => void run([ev({ type: "move", toTableId: t.id })]).then(onBack)} className={btn}>{t.name}</button>
            ))}
          </div>
          <button type="button" onClick={() => setDialog(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "merge" && table && tab && (
        <Modal label="Masayı birleştir" onClose={() => setDialog(null)}>
          <p className="mb-3 text-sm text-muted">Bu adisyona katılacak masayı seçin: ödemesi başlamamış, açık masa adisyonları birleştirilebilir. Seçilen masadaki tüm satırlar buraya taşınır, o masa boşalır.</p>
          <div className="grid gap-2">
            {mergeCandidates(allTabs, tabId).map((src) => {
              const name = tables.find((t) => t.id === src.tableId)?.name ?? "Masa";
              return (
                <button key={src.id} type="button" disabled={busy}
                  onClick={() => void run([
                    ev({ type: "merge", fromTabId: src.id, lines: mergeableLines(src) }),
                    { tabId: src.id, tableId: src.tableId, staffId: waiter.id, ev: { type: "merge_away", toTabId: tabId } },
                  ]).then(onBack)}
                  className={`${btn} justify-between`}>
                  <span className="font-medium">{name}</span>
                  <span className="tabular text-muted">{TL(src.total)} · {src.lines.filter((l) => !l.voided).length} satır</span>
                </button>
              );
            })}
            {mergeCandidates(allTabs, tabId).length === 0 && <p className="text-sm text-muted">Birleştirilecek açık adisyon yok.</p>}
            <button type="button" onClick={() => setDialog(null)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 mt-2 w-full">Vazgeç</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NoteDialog({ line, onSave, onClose }: { line: TabLine; onSave: (note: string | null) => void; onClose: () => void }) {
  const [note, setNote] = useState(line.note ?? "");
  return (
    <Modal label={`Not: ${line.name}`} onClose={onClose}>
      <input autoFocus aria-label="Not" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="mb-4 w-full rounded-[10px] border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
        <button type="button" onClick={() => onSave(note.trim() || null)} className={`flex-[2] ${primary}`}>Kaydet</button>
      </div>
    </Modal>
  );
}
