"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addProduct, lineTotal, removedLines, setQty, totals, type CartLine, type RemovedLine } from "@/lib/core/cart";
import { formatTL, parseTL } from "@/lib/core/money";
import { settle, type Payment } from "@/lib/core/payment";
import { buildIndex, parseKg, resolveScan } from "@/lib/core/scan";
import type { KasaProduct } from "@/lib/offline/state";
import type { Buyer } from "@/lib/core/fiscal";
import { InvoiceForm } from "./InvoiceForm";
import { ArrowRight, Banknote, CheckCircle2, CreditCard, FileText, Plus, Printer, Scale, ScanBarcode, ShoppingBasket, Trash2, Utensils, X } from "lucide-react";
import { Button, Dialog, IconButton } from "@/components/ui";
import { categoryTone } from "@/lib/ui/categoryTone";
import { quickCash } from "@/lib/ui/quickCash";

export type PayResult = { ok: true; saleId: string; receiptNo: string; change: number } | { ok: false; error: string };
export type OnPay = (saleId: string, payments: Payment[], buyer: Buyer | null) => Promise<PayResult>;
export type OnSale = (saleId: string, payments: Payment[], cart: CartLine[], buyer: Buyer | null) => Promise<PayResult>;
export type PrintView = { state: "printing" | "ok" | "fail"; error?: string | null };
export type ReadScale = () => Promise<{ grams: number; stable: boolean }>;

export function PayDialog({ total, onPay, onClose, onDone }: { total: number; onPay: OnPay; onClose: () => void; onDone: (r: { saleId: string; receiptNo: string; change: number }) => void }) {
  const [saleId] = useState(() => crypto.randomUUID()); // diyalog başına bir kez → tekrar denemede aynı satış (idempotent)
  const [cash, setCash] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [meal, setMeal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [invoicing, setInvoicing] = useState(false);

  const payments: Payment[] = [];
  const add = (method: Payment["method"], v: string | null) => { const k = v === null ? null : parseTL(v); if (k) payments.push({ method, amount: k }); };
  add("nakit", cash); add("kart", card); add("yemek_karti", meal);
  const s = settle(total, payments);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, total - paid);
  const all = (m: "nakit" | "kart" | "yemek_karti") => { const v = formatTL(total).replace(" ₺", ""); setCash(m === "nakit" ? v : ""); setCard(m === "kart" ? v : null); setMeal(m === "yemek_karti" ? v : null); };
  const other = (card === null ? 0 : parseTL(card) ?? 0) + (meal === null ? 0 : parseTL(meal) ?? 0);
  const due = Math.max(0, total - other); // nakitle kapanacak kalan
  const setCashK = (k: number) => setCash(formatTL(k).replace(" ₺", ""));
  const full = formatTL(total).replace(" ₺", "");
  const mode = cash === full && card === null && meal === null ? "nakit" : !cash && card === full && meal === null ? "kart" : !cash && card === null && meal === full ? "yemek_karti" : null;
  const submit = () => start(async () => {
    setError(null);
    try {
      const r = await onPay(saleId, payments, buyer);
      if (r.ok) onDone(r); else setError(r.error);
    } catch {
      setError("Satış kaydedilemedi. Tekrar deneyin; satış iki kez kaydedilmez.");
    }
  });

  const METHODS = [
    { m: "nakit" as const, label: "Tamamı nakit", Icon: Banknote },
    { m: "kart" as const, label: "Tamamı kart", Icon: CreditCard },
    { m: "yemek_karti" as const, label: "Tamamı yemek kartı", Icon: Utensils },
  ];
  const amount = "tabular h-14 flex-1 rounded-xl border border-line bg-white px-4 text-right text-2xl font-semibold outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50";
  return (
    <Dialog label="Ödeme" title="Ödeme" aside={<span className="tabular text-3xl font-bold tracking-tight">{formatTL(total)}</span>} onClose={onClose}
      footer={<>
        <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">Vazgeç</Button>
        <Button size="lg" disabled={!s.ok || pending || invoicing} onClick={submit} className="flex-[2]">{pending ? "Kaydediliyor…" : "Satışı tamamla"}</Button>
      </>}>
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map(({ m, label, Icon }) => (
          <button key={m} type="button" onClick={() => all(m)} aria-pressed={mode === m}
            className={`press flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${mode === m ? "border-brand bg-brand-soft text-brand ring-2 ring-brand-ring" : "border-line bg-white hover:border-line-strong hover:bg-surface-2"}`}>
            <Icon aria-hidden className="size-6" />{label}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <label className="flex items-center gap-3"><span className="w-28 text-sm font-medium text-ink-2">Alınan nakit</span><input name="amount-nakit" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0,00" className={amount} /></label>
        {due > 0 && (
          <div className="flex flex-wrap gap-2 pl-[7.75rem]">
            <Button variant="secondary" size="sm" onClick={() => setCashK(due)}>Tam tutar</Button>
            {quickCash(due).map((k) => <Button key={k} variant="secondary" size="sm" className="tabular" onClick={() => setCashK(k)}>{formatTL(k).replace(",00", "")}</Button>)}
          </div>
        )}
        {card !== null && <label className="flex items-center gap-3"><span className="w-28 text-sm font-medium text-ink-2">Kart</span><input name="amount-kart" inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} className={amount} /><IconButton label="Kartı kaldır" onClick={() => setCard(null)}><X aria-hidden className="size-5" /></IconButton></label>}
        {meal !== null && <label className="flex items-center gap-3"><span className="w-28 text-sm font-medium text-ink-2">Yemek kartı</span><input name="amount-yemek_karti" inputMode="decimal" value={meal} onChange={(e) => setMeal(e.target.value)} className={amount} /><IconButton label="Yemek kartını kaldır" onClick={() => setMeal(null)}><X aria-hidden className="size-5" /></IconButton></label>}
        <div className="flex flex-wrap gap-2 pt-1">
          {card === null && <Button variant="ghost" size="sm" onClick={() => setCard("")}><Plus aria-hidden className="size-4" />Kart ekle</Button>}
          {meal === null && <Button variant="ghost" size="sm" onClick={() => setMeal("")}><Plus aria-hidden className="size-4" />Yemek kartı ekle</Button>}
          {!invoicing && <Button variant="ghost" size="sm" onClick={() => setInvoicing(true)}><FileText aria-hidden className="size-4" />Fatura</Button>}
          {buyer && !invoicing && <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 text-sm text-brand" data-testid="buyer-badge">{buyer.name}</span>}
        </div>
      </div>
      {invoicing && <InvoiceForm initial={buyer} onSave={(b) => { setBuyer(b); setInvoicing(false); }} onCancel={() => { setBuyer(null); setInvoicing(false); }} />}
      <div className="mt-5" aria-live="polite">
        {s.ok ? (
          <div className="flex items-baseline justify-between rounded-xl bg-ok-soft px-4 py-3 text-ok"><span className="font-medium">Para üstü</span>{" "}<span className="tabular text-2xl font-bold">{formatTL(s.change)}</span></div>
        ) : payments.length > 0 ? (
          <div className="rounded-xl bg-warn-soft px-4 py-3 text-warn">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Kalan tutar</span>
              <span className="tabular text-xl font-bold">{formatTL(remaining)}</span>
            </div>
            <p className="mt-1 text-xs">{s.error}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-3 px-4 py-3 text-sm text-muted">Ödeme yöntemini seçin ya da alınan tutarı girin.</div>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </Dialog>
  );
}

function WeighDialog({ product, onOk, onClose, scale }: { product: KasaProduct; onOk: (grams: number) => void; onClose: () => void; scale?: ReadScale }) {
  const [v, setV] = useState("");
  const [scaleMsg, setScaleMsg] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const g = parseKg(v);
  const fromScale = async () => {
    setReading(true);
    setScaleMsg(null);
    try {
      const r = await scale!();
      if (!r.stable) setScaleMsg("Tartı dengelenmedi, tekrar deneyin.");
      else if (r.grams <= 0) setScaleMsg("Terazi boş.");
      else setV((r.grams / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
    } catch (e) {
      setScaleMsg(e instanceof Error ? e.message : "Terazi okunamadı.");
    }
    setReading(false);
  };
  return (
    <Dialog label="Tartım" title={product.name} aside={<span className="tabular text-sm text-muted">{formatTL(product.price)}/kg</span>} onClose={onClose} size="sm"
      footer={<>
        <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">Vazgeç</Button>
        <Button type="submit" form="weigh-form" size="lg" disabled={!g} className="flex-[2]">Sepete ekle</Button>
      </>}>
      <form id="weigh-form" onSubmit={(e) => { e.preventDefault(); if (g) onOk(g); }}>
        <label className="block text-sm font-medium text-ink-2" htmlFor="weigh-kg">Ağırlık (kg)</label>
        <input id="weigh-kg" name="kg" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="ör. 0,750" className="tabular mt-1.5 h-16 w-full rounded-xl border border-line px-4 text-right text-3xl font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        {scale && (
          <div className="mt-3 flex items-center gap-3">
            <Button variant="secondary" onClick={() => void fromScale()} disabled={reading}><Scale aria-hidden className="size-4" />{reading ? "Okunuyor…" : "Teraziden al"}</Button>
            {scaleMsg && <span className="text-sm text-bad" role="alert">{scaleMsg}</span>}
          </div>
        )}
        <div className="tabular mt-4 min-h-8 text-right text-2xl font-bold">{g ? formatTL(Math.round((product.price * g) / 1000)) : v && <span className="text-sm font-medium text-bad">Ağırlık geçersiz.</span>}</div>
      </form>
    </Dialog>
  );
}

const MAX_SHOWN = 60;
const kg = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export function SaleScreen({ categories, products, market, onPay, onReceipt, prints = {}, onRetryPrint, scale, onRemove }: { categories: { id: string; name: string }[]; products: KasaProduct[]; market: boolean; onPay: OnSale; onReceipt: (saleId: string) => void; prints?: Record<string, PrintView>; onRetryPrint?: (saleId: string) => void; scale?: ReadScale; onRemove?: (type: "line_removed" | "cart_cleared", lines: RemovedLine[]) => void }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [weigh, setWeigh] = useState<KasaProduct | null>(null);
  const [paying, setPaying] = useState(false);
  const [last, setLast] = useState<{ saleId: string; receiptNo: string; change: number } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const t = totals(cart);
  // M9a: silme/azaltma kaydı. Güncelleyici fonksiyon değil düz değer: StrictMode'da iki kez çağrılıp çift olay yazmasın.
  const shrink = (next: CartLine[]) => {
    const out = removedLines(cart, next);
    setCart(next);
    if (out.length) onRemove?.("line_removed", out);
  };
  const clear = () => {
    if (cart.length) onRemove?.("cart_cleared", removedLines(cart, []));
    setCart([]);
  };
  const index = useMemo(() => buildIndex(products), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    // Markette ızgara yalnız hızlı tuşlar (binlerce ürün); arama her zaman tüm katalogda.
    const base = needle ? products.filter((p) => p.name.toLocaleLowerCase("tr").includes(needle) || p.barcodes.includes(q.trim())) : market ? products.filter((p) => p.quick) : products;
    return base.filter((p) => (cat ? p.categoryId === cat : true)).slice(0, MAX_SHOWN);
  }, [products, cat, q, market]);
  const add = (p: KasaProduct, qtyMilli = 1000) => { setCart((c) => addProduct(c, p, qtyMilli)); setLast(null); setScanError(null); };
  const pick = (p: KasaProduct) => (p.kind === "tartili" ? setWeigh(p) : add(p));
  const refocus = () => requestAnimationFrame(() => search.current?.focus());
  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !q.trim()) return;
    const r = resolveScan(q, index);
    if ("product" in r) { add(r.product, r.qtyMilli); setQ(""); return; }
    if ("weigh" in r) { setWeigh(r.weigh); setQ(""); return; }
    // Barkod değilse ve aramada tek ürün kaldıysa onu ekle (elle arama + Enter).
    if (shown.length === 1 && !/^\d+\*/.test(q.trim())) { pick(shown[0]); setQ(""); return; }
    setScanError(r.error);
    setQ("");
  };

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      } else if (e.key === "Escape" && document.activeElement === search.current && q) {
        e.preventDefault();
        setQ("");
        setScanError(null);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [q]);

  const inCart = new Map(cart.map((l) => [l.productId, l.qtyMilli]));
  const count = cart.reduce((a, l) => a + (byId.get(l.productId)?.kind === "tartili" ? 1 : l.qtyMilli / 1000), 0);
  const chip = (on: boolean) => `press inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand text-white shadow-card" : "border-line bg-white text-ink-2 hover:border-line-strong"}`;

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1fr_400px]">
      <section className="flex min-h-0 flex-col">
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-lg font-semibold tracking-tight">Yeni satış</p>
            <p className="text-xs text-muted">Ürünü seçin veya barkodu okutun.</p>
          </div>
          <span className="hidden rounded-md bg-surface-3 px-2 py-1 text-xs text-muted sm:inline-flex">F2 ara · Enter ekle</span>
        </div>
        <div className="relative">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setScanError(null); }} onKeyDown={onScan} placeholder="Ürün ara ya da barkod okut (5* = 5 adet)" aria-label="Ürün ara ya da barkod okut" autoFocus
            className="h-14 w-full rounded-2xl border border-line bg-white pl-12 pr-4 text-base shadow-card outline-none transition placeholder:text-stone-400 hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        </div>
        <div className="mb-2 mt-1 flex min-h-5 items-center justify-between gap-3 px-1">
          <p className="text-sm font-medium text-bad" role="alert">{scanError}</p>
          {!scanError && <span className="text-xs text-muted">{shown.length} ürün gösteriliyor</span>}
        </div>
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setCat(null)} className={chip(cat === null)}>{market && !q ? "Hızlı tuşlar" : "Tümü"}</button>
          {categories.map((c) => <button key={c.id} type="button" onClick={() => setCat(c.id)} className={chip(cat === c.id)}><span aria-hidden className={`size-2.5 rounded-full ${categoryTone(c.id).dot}`} />{c.name}</button>)}
        </div>
        <div className="grid auto-rows-[7rem] grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.map((p) => {
            const n = inCart.get(p.id);
            return (
              <button key={p.id} type="button" onClick={() => { pick(p); refocus(); }}
                className={`press relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-3.5 pt-4 text-left shadow-card outline-none hover:border-line-strong focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${n ? "border-brand ring-2 ring-brand-ring" : "border-line"}`}>
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${categoryTone(p.categoryId).stripe}`} />
                <span className="line-clamp-2 pr-7 text-[15px] font-semibold leading-snug">{p.name}</span>
                <span className="tabular text-[15px] font-medium text-ink-2">{formatTL(p.price)}{p.kind === "tartili" && <span className="text-muted">/kg</span>}</span>
                {n !== undefined && <span aria-hidden className="tabular absolute right-2.5 top-3 grid min-w-7 place-items-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-white">{p.kind === "tartili" ? <Scale className="size-3.5" /> : n / 1000}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <p className="col-span-full py-12 text-center text-sm text-muted">{market && !q ? "Hızlı tuş yok. Barkod okutun ya da arayın." : "Ürün yok."}</p>}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">Sepet</h2>
          {cart.length > 0 && <span className="tabular text-sm text-muted">{count.toLocaleString("tr-TR")} ürün</span>}
        </div>
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {cart.length === 0 && (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
              <ShoppingBasket aria-hidden className="size-10 text-line-strong" />Sepet boş
            </div>
          )}
          {cart.map((l) => {
            const weighed = byId.get(l.productId)?.kind === "tartili";
            const step = "press grid size-11 place-items-center rounded-xl border border-line bg-white text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60";
            return (
              <div key={l.productId} className="flex items-center gap-2 px-4 py-2.5" data-testid="cart-line">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{l.name}</div><div className="tabular text-xs text-muted">{weighed ? `${kg(l.qtyMilli)} × ${formatTL(l.unitPrice)}/kg` : formatTL(l.unitPrice)}</div></div>
                {weighed ? (
                  <button type="button" aria-label={`${l.name} sil`} onClick={() => shrink(setQty(cart, l.productId, 0))} className={`${step} text-bad`}><Trash2 aria-hidden className="size-4" /></button>
                ) : (
                  <>
                    <button type="button" aria-label={`${l.name} azalt`} onClick={() => shrink(setQty(cart, l.productId, l.qtyMilli - 1000))} className={step}>−</button>
                    <span className="tabular w-8 text-center font-semibold" data-testid="cart-qty">{l.qtyMilli / 1000}</span>
                    <button type="button" aria-label={`${l.name} artır`} onClick={() => setCart((c) => setQty(c, l.productId, l.qtyMilli + 1000))} className={step}>+</button>
                  </>
                )}
                <span className="tabular w-24 text-right font-semibold">{formatTL(lineTotal(l))}</span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line bg-surface-2 p-4">
          {t.vat.map((v) => <div key={v.rate} className="tabular flex justify-between text-xs text-muted"><span>KDV %{v.rate}</span><span>{formatTL(v.vat)}</span></div>)}
          <div data-testid="cart-total" className="tabular mt-1 flex items-baseline justify-between"><span className="text-sm font-medium text-ink-2">TOPLAM</span><span className="text-4xl font-bold tracking-tight">{formatTL(t.total)}</span></div>
          {last && (
            <div className="mt-3 rounded-xl border border-ok/30 bg-ok-soft p-3 text-sm text-ok">
              <div className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-5 shrink-0" />
                <span className="flex-1 font-medium">Fiş {last.receiptNo} · Para üstü {formatTL(last.change)}</span>
                <Button variant="secondary" size="sm" onClick={() => onReceipt(last.saleId)}><Printer aria-hidden className="size-4" />Fişi yazdır</Button>
              </div>
              {prints[last.saleId] && (
                <div className="mt-1.5 pl-7" data-testid="print-state" aria-live="polite">
                  {prints[last.saleId].state === "printing" && "Fiş yazdırılıyor…"}
                  {prints[last.saleId].state === "ok" && "Fiş yazdırıldı."}
                  {prints[last.saleId].state === "fail" && (
                    <span className="text-bad">
                      Yazdırılamadı{prints[last.saleId].error ? ` (${prints[last.saleId].error})` : ""}.{" "}
                      <button type="button" onClick={() => onRetryPrint?.(last.saleId)} className="font-medium underline">Yeniden dene</button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" size="xl" onClick={clear} disabled={!cart.length} className="!text-base !font-medium"><Trash2 aria-hidden className="size-5" />Temizle</Button>
            <Button size="xl" onClick={() => setPaying(true)} disabled={!cart.length} className="text-xl">Öde<ArrowRight aria-hidden className="size-6" /></Button>
          </div>
        </div>
      </aside>
      {weigh && <WeighDialog product={weigh} scale={scale} onClose={() => { setWeigh(null); refocus(); }} onOk={(g) => { add(weigh, g); setWeigh(null); refocus(); }} />}
      {paying && <PayDialog total={t.total} onPay={(id, p, b) => onPay(id, p, cart, b)} onClose={() => { setPaying(false); refocus(); }} onDone={(r) => { setPaying(false); setCart([]); setLast(r); refocus(); }} />}
    </div>
  );
}
