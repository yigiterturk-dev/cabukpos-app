"use client";
// Masa adisyonu: ürün ızgarası (seçenek penceresi), adisyon satırları, mutfağa gönder, taşı, ikram/indirim/iptal (müdür onayı), hesap.
// Her dokunuş bir adisyon olayıdır (yerel + giden kutusu) → çökmede kaybolmaz, diğer cihazlara akışla gider.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { parseMoney, type Currency } from "@/lib/core/money";
import { currencyUnit, kasaFmt } from "./kasa-format";
import { optionsText, validateOptions, type OptionGroup } from "@/lib/core/options";
import { qtyText } from "@/lib/core/receipt";
import { lineGross, mergeCandidates, mergeableLines, openTabsByTable, type TabLine, type TabState } from "@/lib/core/tab";
import { normalizeSearchText } from "@/lib/core/search";
import { sendByStation } from "@/lib/core/platform";
import { FEE_NAME, formatPhone, intentLabel, zoneCheck } from "@/lib/core/delivery";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { KasaProduct, KasaStaff, Meta, Table } from "@/lib/offline/state";
import { PinPad } from "./PinPad";
import { Dialog } from "@/components/ui";
import { categoryTone } from "@/lib/ui/categoryTone";
import { minutesSince } from "./useTabs";
import { useKasaMainProps } from "./KasaPreviewContext";

type Add = (list: NewTabEvent[]) => Promise<unknown>;
export type Waiter = { id: string; name: string; role: KasaStaff["role"] };
const DialogFeedbackContext = createContext<{ error: string | null; busy: boolean }>({ error: null, busy: false });

export function Modal({ label, children, onClose, closeDisabled = false, statusMessage }: { label: string; children: React.ReactNode; onClose: () => void; closeDisabled?: boolean; statusMessage?: string }) {
  const { error, busy } = useContext(DialogFeedbackContext);
  return <Dialog label={label} title={label} onClose={onClose} closeDisabled={closeDisabled}>
    {(statusMessage || busy) && <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage || "Adisyon işlemi kaydediliyor. Lütfen bekleyin."}</p>}
    {error && <p tabIndex={-1} data-dialog-action-error className="mb-3 break-words rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{error}</p>}
    {children}
  </Dialog>;
}

const focus = "outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60";
const btn = `press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-medium shadow-card hover:border-line-strong hover:bg-surface-2 disabled:opacity-40 ${focus}`;
const strong = `press inline-flex min-h-12 items-center justify-center rounded-[10px] bg-espresso px-3 text-sm font-medium text-white shadow-card hover:bg-espresso-2 disabled:pointer-events-none disabled:opacity-40 ${focus}`;
const chip = (on: boolean) => `press inline-flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap ${on ? "border-brand bg-brand-action text-white shadow-card" : "border-line bg-surface text-ink-2 hover:border-line-strong"} ${focus}`;
const primary = `press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-3 font-semibold text-white shadow-rest ring-1 ring-inset ring-white/15 hover:bg-brand-action-hover hover:shadow-raised disabled:opacity-40 ${focus}`;

function OptionsDialog({ product, groups, onAdd, onClose, currency, busy }: { product: KasaProduct; groups: OptionGroup[]; onAdd: (unitPrice: number, options: { id: string; name: string; delta: number }[], note: string | null, qtyMilli: number) => void; onClose: () => void; currency?: Currency; busy: boolean }) {
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
    <Modal label={product.name} onClose={onClose} closeDisabled={busy}>
      {groups.map((g) => (
        <fieldset key={g.id} className="mb-4">
          <legend className="mb-2 text-sm font-medium">{g.name} <span className="font-normal text-muted">{g.min > 0 || g.max > 1 ? `(${[g.min > 0 ? `en az ${g.min} seçim` : "", g.max > 1 ? `en çok ${g.max}` : ""].filter(Boolean).join(" · ")})` : ""}</span></legend>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => {
              const selected = picked.includes(o.id);
              const groupFull = g.max > 1 && picked.filter((id) => g.options.some((option) => option.id === id)).length >= g.max;
              return <button key={o.id} type="button" disabled={busy || (groupFull && !selected)} aria-pressed={selected} onClick={() => toggle(g, o.id)} className={`inline-flex min-h-12 items-center rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>
                {o.name}{o.delta ? ` ${o.delta > 0 ? "+" : "−"}${TL(Math.abs(o.delta))}` : ""}
              </button>;
            })}
          </div>
          {g.max > 1 && picked.filter((id) => g.options.some((option) => option.id === id)).length >= g.max && <p className="mt-1 text-xs text-muted">En fazla {g.max} seçenek seçebilirsiniz.</p>}
        </fieldset>
      ))}
      <label className="mb-4 block text-sm"><span className="mb-1 block font-medium">Not</span><input disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ör. soğansız" className="min-h-12 w-full rounded-[10px] border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50 disabled:opacity-60" /></label>
      <div className="mb-4 flex items-center gap-3">
        <button type="button" aria-label={`${product.name} miktarını azalt`} disabled={busy} onClick={() => setQty((q) => Math.max(1, q - 1))} className={btn}>−</button>
        <span className="tabular w-8 text-center text-lg font-semibold">{qty}</span>
        <button type="button" aria-label={`${product.name} miktarını artır`} disabled={busy} onClick={() => setQty((q) => Math.min(99, q + 1))} className={btn}>+</button>
        <span className="tabular ml-auto font-semibold" aria-live="polite" aria-atomic="true">{r.ok ? `${qty} adet. Toplam ${TL(r.unitPrice * qty)}` : `${qty} adet`}</span>
      </div>
      {!r.ok && <p className="mb-2 text-sm text-bad" role="status" aria-live="polite">{r.error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
        <button type="button" disabled={!r.ok || busy} onClick={() => r.ok && !busy && onAdd(r.unitPrice, r.options, note.trim() || null, qty * 1000)} className={`flex-[2] ${primary}`}>{busy ? "Ekleniyor…" : "Ekle"}</button>
      </div>
    </Modal>
  );
}

/** Gerekçe (+ indirimde tutar) ve müdür değilse müdür PIN'i. */
function ApprovalDialog({ meta, onMeta, waiter, title, discount, onOk, onClose, busy }: {
  meta: Meta; onMeta: (m: Meta) => void; waiter: Waiter; title: string; discount?: boolean;
  onOk: (approvedBy: string | null, reason: string, d?: { percent: number | null; amount: number | null }, approvalToken?: string) => void | Promise<void>; onClose: () => void; busy: boolean;
}) {
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"yuzde" | "tutar" | "kaldir">("yuzde");
  const [value, setValue] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");
  const pct = Number(value), amt = parseMoney(value);
  const d = !discount ? undefined : kind === "kaldir" ? { percent: null, amount: null } : kind === "yuzde" ? { percent: Number.isInteger(pct) && pct >= 1 && pct <= 100 ? pct : NaN, amount: null } : { percent: null, amount: amt ?? NaN };
  const valid = reason.trim().length >= 2 || kind === "kaldir" && discount;
  const reasonInvalid = reason.trim().length > 0 && reason.trim().length < 2;
  const discountValueInvalid = Boolean(discount && kind !== "kaldir" && (kind === "yuzde"
    ? !Number.isInteger(pct) || pct < 1 || pct > 100
    : amt === null || amt <= 0 || amt > 100_000_000));
  const discountValueError = discountValueInvalid && value.trim().length > 0;
  const dValid = !d || (d.percent === null || !Number.isNaN(d.percent)) && !discountValueInvalid && (d.amount === null || !Number.isNaN(d.amount));
  const next = () => (waiter.role === "mudur" ? onOk(null, reason.trim(), d) : setStep("pin"));
  return (
    <Modal label={title} onClose={onClose} closeDisabled={busy}>
      {busy ? <p className="py-6 text-center text-sm text-muted" role="status" aria-live="polite">İşleniyor…</p> : step === "form" ? (
        <>
          {discount && (
            <div className="mb-4">
              <fieldset className="mb-2 m-0 flex gap-1 border-0 p-0">
                <legend className="sr-only">İndirim türü</legend>
                {([["yuzde", "Yüzde"], ["tutar", `Tutar (${currencyUnit(meta.device?.currency)})`], ["kaldir", "İndirimi kaldır"]] as const).map(([k, l]) => (
                  <label key={k} className={`inline-flex min-h-12 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${kind === k ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>
                    <input type="radio" name="discount-kind" value={k} checked={kind === k} onChange={() => { setKind(k); setValue(""); }} className="peer sr-only" />
                    {l}
                  </label>
                ))}
              </fieldset>
              {kind !== "kaldir" && <>
                <input aria-label={kind === "yuzde" ? "İndirim yüzdesi" : "İndirim tutarı"} aria-describedby="approval-discount-hint" aria-invalid={discountValueError || undefined} inputMode={kind === "yuzde" ? "numeric" : "decimal"} maxLength={kind === "yuzde" ? 3 : 12} value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "yuzde" ? "1–100" : "0,00"} className={`tabular min-h-12 w-full rounded-lg border bg-surface px-3 py-2 text-right outline-none focus-visible:ring-4 ${discountValueError ? "border-bad focus-visible:ring-bad/30" : "border-line focus-visible:border-brand focus-visible:ring-brand-ring/60"}`} />
                <p id="approval-discount-hint" className={`mt-1 text-xs ${discountValueError ? "text-bad" : "text-muted"}`}>{kind === "yuzde" ? "1–100 arasında tam sayı girin." : `0'dan büyük indirim tutarını ${currencyUnit(meta.device?.currency)} biçiminde girin (ör. 25,00); üst sınır 1.000.000.`}</p>
              </>}
            </div>
          )}
          <label className="mb-4 block text-sm"><span className="mb-1 block font-medium">Gerekçe</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ör. müşteri talebi" aria-invalid={reasonInvalid || undefined} aria-describedby="approval-reason-hint" className={`min-h-12 w-full rounded-[10px] border bg-surface px-3 py-2 outline-none focus:ring-4 ${reasonInvalid ? "border-bad focus:ring-bad/30" : "border-line focus:border-brand focus:ring-brand-ring/50"}`} /><span id="approval-reason-hint" className={`mt-1 block text-xs ${reasonInvalid ? "text-bad" : "text-muted"}`}>{discount && kind === "kaldir" ? "İndirimi kaldırırken gerekçe isteğe bağlıdır; girerseniz en az 2 karakter olmalı." : "En az 2 karakter girin; onay kaydında saklanır."}</span></label>
          {waiter.role !== "mudur" && <p className="mb-3 text-sm text-muted">Müdür onayı gerekir.</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
            <button type="button" disabled={!valid || !dValid} onClick={next} className={`flex-[2] ${primary}`}>{waiter.role === "mudur" ? "Onayla" : "Müdür onayına"}</button>
          </div>
        </>
      ) : (
        <>
          <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m, token) => onOk(m.id, reason.trim(), d, token)} autoFocusFirst />
          <button type="button" disabled={busy} onClick={onClose} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 mt-4 w-full">Vazgeç</button>
        </>
      )}
    </Modal>
  );
}

type Dialog =
  | { k: "options"; product: KasaProduct }
  | { k: "line"; line: TabLine }
  | { k: "approve"; title: string; discount?: boolean; run: (approvedBy: string | null, reason: string, d?: { percent: number | null; amount: number | null }, approvalToken?: string) => NewTabEvent[] }
  | { k: "note"; line: TabLine }
  | { k: "move" }
  | { k: "merge" };

/** table null → paket/platform adisyonu (M6): taşı/hesap iste yok, sipariş bilgisi üstte, ilk gönderimde paket fişi (onFirstSend). */
export function TabScreen({ meta, onMeta, table, title, tabs, allTabs, waiter, canPay, add, now, onBill, onBack, onFirstSend }: {
  meta: Meta; onMeta: (m: Meta) => void; table: Table | null; title: string; tabs: TabState[]; allTabs: Map<string, TabState>; waiter: Waiter; canPay: boolean; add: Add; now: number;
  onBill: (tabId: string) => void; onBack: () => void; onFirstSend?: (tab: TabState) => void;
}) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt(meta);
  const [newTabId] = useState(() => crypto.randomUUID());
  const [pick, setPick] = useState<string | null>(null);
  const tab = tabs.find((t) => t.id === pick) ?? tabs[0] ?? null;
  const tabId = tab?.id ?? newTabId;
  const [cat, setCat] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [productSearchAnnouncement, setProductSearchAnnouncement] = useState<{ key: string; text: string } | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const openDialog = (next: Dialog) => { setActionError(null); setDialog(next); };
  const [actionNotice, setActionNotice] = useState("");
  const cats = meta.catalog.categories;
  const groups = meta.catalog.optionGroups ?? [];
  const tables = meta.catalog.tables ?? [];
  const productNeedle = normalizeSearchText(productQuery.trim());
  const products = meta.catalog.products.filter((p) => p.kind === "adet"
    && (cat === null || p.categoryId === cat)
    && (!productNeedle || normalizeSearchText(p.name).includes(productNeedle) || p.barcodes.some((barcode) => barcode.includes(productQuery.trim()))));
  const searchAnnouncementKey = `${productQuery}\u0000${cat ?? ""}\u0000${products.length}`;
  useEffect(() => {
    const query = productQuery.trim();
    if (!query) return;
    const timeout = window.setTimeout(() => {
      const term = query.length > 40 ? `${query.slice(0, 40)}…` : query;
      setProductSearchAnnouncement({ key: searchAnnouncementKey, text: `${term}: ${products.length ? `${products.length} ürün bulundu.` : "Eşleşen ürün yok."}` });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [productQuery, cat, products.length, searchAnnouncementKey]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (dialog) return;
      if (event.key === "F2") {
        event.preventDefault();
        productSearchRef.current?.focus();
        productSearchRef.current?.select();
      } else if (event.key === "Escape" && document.activeElement === productSearchRef.current && productQuery) {
        event.preventDefault();
        setProductQuery("");
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [dialog, productQuery]);
  const ev = (e: NewTabEvent["ev"], approvedBy: string | null = null, approvalToken?: string): NewTabEvent => ({ tabId, tableId: table?.id ?? null, staffId: waiter.id, approvedBy, approvalToken, ev: e });
  const run = async (list: NewTabEvent[], returnFocusTo?: HTMLButtonElement) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    setActionNotice("");
    try {
      await add(list);
      const added = list.flatMap((item) => item.ev.type === "add" ? [item.ev] : []);
      const events = list.map((item) => item.ev);
      if (events.some((event) => event.type === "void" && event.reason === "not değişti") && added.length) setActionNotice("Ürün notu güncellendi.");
      else if (added.length === 1) setActionNotice(`${added[0].name} adisyona eklendi.`);
      else if (added.length > 1) setActionNotice(`${added.length} ürün adisyona eklendi.`);
      else if (events.some((event) => event.type === "send")) {
        const count = events.reduce((total, event) => total + (event.type === "send" ? event.lineIds.length : 0), 0);
        setActionNotice(`${count} ürün mutfağa gönderildi.`);
      } else if (events.some((event) => event.type === "bill")) setActionNotice("Hesap isteği gönderildi.");
      else if (events.some((event) => event.type === "kitchen")) setActionNotice("Hazır ürün teslim edildi.");
      else if (events.some((event) => event.type === "discount")) setActionNotice("Adisyon indirimi kaydedildi.");
      else if (events.some((event) => event.type === "comp")) setActionNotice("İkram kaydedildi.");
      else if (events.some((event) => event.type === "merge" || event.type === "merge_away")) setActionNotice("Adisyonlar birleştirildi.");
      else if (events.some((event) => event.type === "move")) setActionNotice("Masa taşındı.");
      else if (events.some((event) => event.type === "void")) setActionNotice("Ürün adisyondan kaldırıldı.");
      else if (events.some((event) => event.type === "close")) setActionNotice("Masa kapatıldı.");
      setDialog(null);
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "İşlem tamamlanamadı. Tekrar deneyin.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (returnFocusTo) requestAnimationFrame(() => {
        if (document.activeElement !== document.body) return;
        const target = returnFocusTo.isConnected && !returnFocusTo.disabled
          ? returnFocusTo
          : document.getElementById("tab-heading");
        target?.focus();
      });
    }
  };

  useEffect(() => {
    if (!actionError || !dialog) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>("[role=dialog]");
      if (!panel) return;
      const errorMessage = panel.querySelector<HTMLElement>("[data-dialog-action-error]");
      if (errorMessage) { errorMessage.focus(); return; }
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.contains(active) && !active.matches(":disabled")) return;
      panel.querySelector<HTMLElement>('button:not(:disabled):not([aria-label="Pencereyi kapat"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionError, dialog]);

  const addLine = (p: KasaProduct, unitPrice: number, options: { id: string; name: string; delta: number }[], note: string | null, qtyMilli: number, returnFocusTo?: HTMLButtonElement) =>
    run([...(tab ? [] : [ev({ type: "open", guests: 0 })]), ev({ type: "add", lineId: crypto.randomUUID(), productId: p.id, name: p.name, unitPrice, vatRate: p.vatRate, qtyMilli, options, note, stationId: p.stationId ?? null })], returnFocusTo);
  const tapProduct = (p: KasaProduct, source?: HTMLButtonElement) => {
    const gs = (p.optionGroupIds ?? []).map((id) => groups.find((g) => g.id === id)).filter((g): g is OptionGroup => Boolean(g));
    if (gs.length) openDialog({ k: "options", product: p });
    else void addLine(p, p.price, [], null, 1000, source);
  };

  const live = tab?.lines.filter((l) => !l.voided) ?? [];
  const inTab = new Map<string, number>();
  for (const line of live) if (line.productId) inTab.set(line.productId, (inTab.get(line.productId) ?? 0) + line.qtyMilli);
  const unsent = live.filter((l) => !l.sent && l.productId !== null);
  const send = (source: HTMLButtonElement) => {
    const first = tab && tab.tickets.length === 0;
    // Serbest satır (paket ücreti) mutfağa gitmez
    const lines = unsent.filter((l) => l.productId !== null);
    void run(sendByStation(lines, () => crypto.randomUUID()).map((s) => ev(s)), source).then((ok) => { if (ok && first && tab) onFirstSend?.(tab); });
  };
  const order = tab?.order ?? null;
  const zone = order?.zoneId ? meta.catalog.deliveryZones?.find((z) => z.id === order.zoneId) ?? null : null;
  const subtotal = live.filter((l) => !l.comped && l.name !== FEE_NAME).reduce((a, l) => a + lineGross(l), 0);
  const belowMin = !table && zoneCheck(zone, subtotal).belowMin;
  const ready = tab?.tickets.filter((k) => k.status === "hazir") ?? [];
  const occupied = openTabsByTable(allTabs);

  return (
    <DialogFeedbackContext.Provider value={{ error: dialog ? actionError : null, busy }}>
    <div {...mainProps} className="grid min-h-0 min-w-0 flex-1 outline-none md:overflow-hidden md:grid-cols-[minmax(0,1fr)_24rem]">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{actionNotice}</p>
      {!dialog && <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{busy ? "Adisyon işlemi kaydediliyor. Lütfen bekleyin." : ""}</p>}
      <section className="min-w-0 p-4 md:min-h-0 md:overflow-y-auto">
        <div className="mb-3 flex min-w-0 items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Ürün adı veya barkod ara</span>
            <input ref={productSearchRef} type="search" maxLength={80} value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={(event) => {
              if (event.key !== "Enter" || busy || dialog || !productQuery.trim()) return;
              const exactBarcode = products.find((product) => product.barcodes.includes(productQuery.trim()));
              const match = exactBarcode ?? (products.length === 1 ? products[0] : null);
              if (!match) return;
              event.preventDefault();
              tapProduct(match);
              setProductQuery("");
            }} placeholder="Ürün adı veya barkod ara" autoComplete="off" aria-describedby="tab-product-search-help" className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-brand focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
          </label>
          <span id="tab-product-search-help" className="sr-only">F2 aramaya gider. Tek ürün eşleşirken Enter ürünü ekler. Escape aramayı temizler.</span>
          {productQuery && <button type="button" onClick={() => { setProductQuery(""); productSearchRef.current?.focus(); }} className={btn}>Temizle</button>}
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{productQuery.trim() && productSearchAnnouncement?.key === searchAnnouncementKey ? productSearchAnnouncement.text : ""}</p>
        <HorizontalScrollRegion label="Ürün kategorileri, yatay kaydırılabilir" className="-mx-1 mb-3 flex gap-2 px-1 pb-1">
          <button type="button" aria-pressed={cat === null} onClick={() => setCat(null)} className={chip(cat === null)}>Tümü</button>
          {cats.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} title={c.name} onClick={() => setCat(c.id)} className={chip(cat === c.id)}><span aria-hidden className={`size-2.5 rounded-full ${categoryTone(c.id).dot}`} />{c.name}</button>)}
        </HorizontalScrollRegion>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {products.map((p) => (
            <button key={p.id} type="button" disabled={busy} onClick={(event) => tapProduct(p, event.currentTarget)} className={`press relative flex min-w-0 min-h-24 flex-col overflow-hidden rounded-2xl border bg-surface p-3.5 pt-4 text-left shadow-card outline-none hover:border-line-strong focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50 ${inTab.has(p.id) ? "border-brand ring-2 ring-brand-ring" : "border-line"}`}>
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${categoryTone(p.categoryId).stripe}`} />
              <span className="line-clamp-2 min-w-0 font-display font-semibold leading-snug" title={p.name}>{p.name}</span>
              <span className="tabular mt-auto pt-2 text-sm font-medium text-ink-2">{TL(p.price)}{p.optionGroupIds?.length ? " ⋯" : ""}</span>
              {inTab.has(p.id) && <span className="absolute right-2 top-2 grid min-w-7 place-items-center rounded-full bg-brand-action px-1.5 py-0.5 text-xs font-bold text-white">{inTab.get(p.id)! / 1000}<span className="sr-only"> adisyonda</span></span>}
            </button>
          ))}
        </div>
        {products.length === 0 && <div className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          <p>{productNeedle ? "Bu aramayla eşleşen ürün yok." : "Bu kategoride ürün yok."}</p>
          {(productQuery || cat) && <button type="button" onClick={() => { setProductQuery(""); setCat(null); }} className={`${btn} mt-3`}>Aramayı ve kategoriyi temizle</button>}
        </div>}
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <button type="button" disabled={busy} onClick={onBack} className="press inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50 -ml-2">← {table ? "Salon" : "Paket"}</button>
          <h2 id="tab-heading" tabIndex={-1} className="min-w-0 flex-1 truncate rounded-sm font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" title={title}>{title}</h2>
          {tab && <span className="shrink-0 text-sm text-muted">{minutesSince(tab.openedAt, now)} dk</span>}
          {tabs.length > 1 && (
            <HorizontalScrollRegion label="Adisyon seçimi, yatay kaydırılabilir" className="order-last flex w-full max-w-full shrink-0 gap-1 sm:order-none sm:ml-auto sm:w-auto sm:max-w-[45%]">
              {tabs.map((t, i) => <button key={t.id} type="button" disabled={busy} aria-pressed={t.id === tabId} onClick={() => setPick(t.id)} className={`inline-flex min-h-12 shrink-0 items-center rounded px-2 py-1 text-xs outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50 ${t.id === tabId ? "bg-brand-action text-white" : "border border-line bg-surface"}`}>Adisyon {i + 1}</button>)}
            </HorizontalScrollRegion>
          )}
        </div>
        {order && (
          <div className="border-b border-line px-3 py-2 text-sm" data-testid="order-info">
            <div className="min-w-0 truncate font-medium" title={`${order.name} · ${formatPhone(order.phone)}`}>{order.name} · <span className="tabular">{formatPhone(order.phone)}</span></div>
            <div className="truncate text-ink-2" title={`${order.address}${order.directions ? ` · ${order.directions}` : ""}`}>{order.address}{order.directions ? ` · ${order.directions}` : ""}</div>
            <div className="break-words text-xs text-muted" title={[zone?.name, intentLabel(order.payIntent), order.note].filter(Boolean).join(" · ")}>{[zone?.name, intentLabel(order.payIntent), order.note].filter(Boolean).join(" · ")}</div>
            {belowMin && zone && <div className="mt-1 text-xs font-medium text-warn">Asgari tutar {TL(zone.minOrder)} altında</div>}
          </div>
        )}
        <ul className="flex-1 divide-y divide-line overflow-y-auto" aria-label="Adisyon">
          {!tab && <li className="p-6 text-center text-sm text-muted">Boş masa. Ürüne dokunarak sipariş açın.</li>}
          {tab?.lines.map((l) => {
            const k = tab.tickets.find((t) => t.lineIds.includes(l.lineId));
            return (
              <li key={l.lineId}>
            <button type="button" disabled={l.voided || busy} onClick={() => openDialog({ k: "line", line: l })} className={`flex min-h-12 w-full items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-60 ${l.voided ? "text-muted line-through" : ""}`}>
                  <span className="tabular w-8 font-semibold">{qtyText(l.qtyMilli)}×</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{l.name}</span>
                    {l.options.length > 0 && <span className="block break-words text-xs text-muted">{optionsText(l.options)}</span>}
                    {l.note && <span className="block break-words text-xs text-warn">! {l.note}</span>}
                    <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                      {!l.sent && !l.voided && l.productId !== null && <span className="rounded bg-warn-soft px-1.5 text-warn">gönderilmedi</span>}
                      {k && <span className={`rounded px-1.5 ${k.status === "hazir" ? "bg-ok-action text-white" : "bg-surface-3"}`}>{{ yeni: "mutfakta", hazirlaniyor: "hazırlanıyor", hazir: "hazır", teslim: "teslim" }[k.status]}</span>}
                      {l.comped && <span className="rounded bg-brand-soft px-1.5 text-brand">ikram</span>}
                      {l.paidMilli > 0 && <span className="rounded bg-surface-3 px-1.5">ödendi {qtyText(l.paidMilli)}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 tabular">{l.comped ? TL(0) : TL(lineGross(l))}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {tab && (
          <div className="shrink-0 space-y-2 border-t border-line bg-surface-2 p-3">
            {tab.discountAmount > 0 && <div className="flex justify-between text-sm"><span>İndirim</span><span className="tabular">−{TL(tab.discountAmount)}</span></div>}
            {tab.paid > 0 && <div className="flex justify-between text-sm"><span>Ödenen</span><span className="tabular">−{TL(tab.paid)}</span></div>}
            <div className="flex items-baseline justify-between"><span className="text-sm font-medium text-ink-2">Kalan</span><span className="tabular font-display text-3xl font-extrabold tracking-tight" data-testid="tab-remaining">{TL(tab.remaining)}</span></div>
            {tab.remaining === 0 && live.length > 0 && live.every((l) => l.comped || l.paidMilli >= l.qtyMilli) && (
              <button type="button" disabled={busy} onClick={() => void run([ev({ type: "close", reason: "ödenecek tutar yok" })]).then((ok) => { if (ok) onBack(); })} className={`w-full ${strong}`}>{busy ? "Kapatılıyor…" : "Masayı kapat"}</button>
            )}
            {ready.length > 0 && <button type="button" disabled={busy} onClick={(event) => void run(ready.map((k) => ev({ type: "kitchen", ticketId: k.id, status: "teslim" })), event.currentTarget)} className="press min-h-12 w-full rounded-[10px] bg-ok-action text-sm font-medium text-white shadow-card outline-none hover:bg-ok-action-hover focus-visible:ring-4 focus-visible:ring-ok/30 disabled:pointer-events-none disabled:opacity-40">{busy ? "Güncelleniyor…" : "Hazır — teslim edildi"}</button>}
            <div className="grid grid-cols-2 gap-2">
              {table && <button type="button" disabled={busy} onClick={() => openDialog({ k: "move" })} className={btn}>Taşı</button>}
              {table && <button type="button" disabled={busy} onClick={() => openDialog({ k: "merge" })} className={btn}>Birleştir</button>}
              <button type="button" disabled={busy} onClick={() => openDialog({ k: "approve", title: "Adisyon indirimi", discount: true, run: (by, reason, d, token) => [ev({ type: "discount", percent: d!.percent, amount: d!.amount, reason }, by, token)] })} className={btn}>İndirim</button>
              {!canPay && table && <button type="button" disabled={busy || tab.billRequested} onClick={(event) => void run([ev({ type: "bill" })], event.currentTarget)} className={btn}>{tab.billRequested ? "Hesap istendi" : "Hesap iste"}</button>}
              {canPay && <button type="button" disabled={busy || (tab.remaining === 0 && live.every((l) => l.comped || l.paidMilli >= l.qtyMilli))} onClick={() => onBill(tab.id)} className={`${strong} font-medium`}>Hesap al / böl</button>}
            </div>
          </div>
        )}
        <div className="shrink-0 border-t border-line bg-surface-2 p-3 pt-0">
          <button type="button" disabled={!unsent.length || busy} onClick={(event) => send(event.currentTarget)} className={`min-h-14 w-full text-lg ${primary}`}>{busy ? "Gönderiliyor…" : "Mutfağa gönder"}{!busy && unsent.length ? ` (${unsent.length})` : ""}</button>
        </div>
      </aside>

      {dialog?.k === "options" && (
        <OptionsDialog product={dialog.product} currency={meta.device?.currency} busy={busy} groups={(dialog.product.optionGroupIds ?? []).map((id) => groups.find((g) => g.id === id)).filter((g): g is OptionGroup => Boolean(g))}
          onClose={() => setDialog(null)} onAdd={(unit, opts, note, q) => void addLine(dialog.product, unit, opts, note, q)} />
      )}
      {dialog?.k === "line" && (
        <Modal label={dialog.line.name} onClose={() => setDialog(null)} closeDisabled={busy}>
          <div className="grid gap-2">
            {!dialog.line.sent ? (
              <>
                <button type="button" disabled={busy} onClick={() => void run([ev({ type: "void", lineId: dialog.line.lineId, reason: "gönderilmeden silindi" })])} className={btn}>Sil</button>
                <button type="button" disabled={busy} onClick={() => openDialog({ k: "note", line: dialog.line })} className={btn}>Not ekle / değiştir</button>
              </>
            ) : dialog.line.paidMilli === 0 && (
              <button type="button" disabled={busy} onClick={() => { const l = dialog.line; openDialog({ k: "approve", title: `İptal: ${l.name}`, run: (by, reason, _d, token) => [ev({ type: "void", lineId: l.lineId, reason }, by, token)] }); }} className={btn}>İptal et (müdür onayı)</button>
            )}
            {!dialog.line.comped && dialog.line.paidMilli === 0 && (
              <button type="button" disabled={busy} onClick={() => { const l = dialog.line; openDialog({ k: "approve", title: `İkram: ${l.name}`, run: (by, reason, _d, token) => [ev({ type: "comp", lineId: l.lineId, reason }, by, token)] }); }} className={btn}>İkram et</button>
            )}
            <button type="button" disabled={busy} onClick={() => setDialog(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 mt-2 w-full">Kapat</button>
          </div>
        </Modal>
      )}
      {dialog?.k === "note" && <NoteDialog line={dialog.line} busy={busy} onClose={() => setDialog(null)} onSave={(note) => {
        const l = dialog.line; // not = satırı sil + aynısını notla yeniden ekle (gönderilmemiş satır)
        void run([ev({ type: "void", lineId: l.lineId, reason: "not değişti" }), ev({ type: "add", lineId: crypto.randomUUID(), productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, options: l.options, note, stationId: l.stationId })]);
      }} />}
      {dialog?.k === "approve" && (
        <ApprovalDialog meta={meta} onMeta={onMeta} waiter={waiter} title={dialog.title} discount={dialog.discount} busy={busy} onClose={() => setDialog(null)} onOk={async (by, reason, d, token) => { await run(dialog.run(by, reason, d, token)); }} />
      )}
      {dialog?.k === "move" && table && (
        <Modal label={`${table.name} → taşı`} onClose={() => setDialog(null)} closeDisabled={busy}>
          <div className="grid grid-cols-4 gap-2">
            {tables.filter((t) => t.id !== table.id && !occupied.has(t.id)).map((t) => (
              <button key={t.id} type="button" disabled={busy} onClick={() => void run([ev({ type: "move", toTableId: t.id })]).then((ok) => { if (ok) onBack(); })} className={btn}>{busy ? "Taşınıyor…" : t.name}</button>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => setDialog(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 mt-4 w-full">Vazgeç</button>
        </Modal>
      )}
      {dialog?.k === "merge" && table && tab && (
        <Modal label="Masayı birleştir" onClose={() => setDialog(null)} closeDisabled={busy}>
          <p className="mb-3 text-sm text-muted">Bu adisyona katılacak masayı seçin: ödemesi başlamamış, açık masa adisyonları birleştirilebilir. Seçilen masadaki tüm satırlar buraya taşınır, o masa boşalır.</p>
          <div className="grid gap-2">
            {mergeCandidates(allTabs, tabId).map((src) => {
              const name = tables.find((t) => t.id === src.tableId)?.name ?? "Masa";
              return (
                <button key={src.id} type="button" disabled={busy}
                  onClick={() => void run([
                    ev({ type: "merge", fromTabId: src.id, lines: mergeableLines(src) }),
                    { tabId: src.id, tableId: src.tableId, staffId: waiter.id, ev: { type: "merge_away", toTabId: tabId } },
                  ]).then((ok) => { if (ok) onBack(); })}
                  className={`${btn} justify-between`}>
                  <span className="font-medium">{name}</span>
                  <span className="tabular text-muted">{TL(src.total)} · {src.lines.filter((l) => !l.voided).length} satır</span>
                </button>
              );
            })}
            {mergeCandidates(allTabs, tabId).length === 0 && <p className="text-sm text-muted">Birleştirilecek açık adisyon yok.</p>}
          <button type="button" disabled={busy} onClick={() => setDialog(null)} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 mt-2 w-full">Vazgeç</button>
          </div>
        </Modal>
      )}
      {actionError && !dialog && (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-center md:inset-x-auto md:right-6">
          <p className="pointer-events-auto max-w-md break-words rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm font-medium text-bad shadow-pop" role="alert" aria-live="assertive">{actionError}</p>
        </div>
      )}
    </div>
    </DialogFeedbackContext.Provider>
  );
}

function NoteDialog({ line, onSave, onClose, busy }: { line: TabLine; onSave: (note: string | null) => void; onClose: () => void; busy: boolean }) {
  const [note, setNote] = useState(line.note ?? "");
  return (
    <Modal label={`Not: ${line.name}`} onClose={onClose} closeDisabled={busy}>
      <input autoFocus disabled={busy} aria-label="Not" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="mb-4 min-h-12 w-full rounded-[10px] border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50 disabled:opacity-60" />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={`flex-1 ${btn}`}>Vazgeç</button>
        <button type="button" disabled={busy} onClick={() => onSave(note.trim() || null)} className={`flex-[2] ${primary}`}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </Modal>
  );
}
