"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { addProduct, lineTotal, setQty, totals, type CartLine } from "@/lib/core/cart";
import { formatTL, parseTL } from "@/lib/core/money";
import { settle, type Payment } from "@/lib/core/payment";
import { buildIndex, parseKg, resolveScan } from "@/lib/core/scan";
import type { KasaProduct } from "@/lib/offline/state";

export type PayResult = { ok: true; saleId: string; receiptNo: string; change: number } | { ok: false; error: string };
export type OnPay = (saleId: string, payments: Payment[]) => Promise<PayResult>;
export type OnSale = (saleId: string, payments: Payment[], cart: CartLine[]) => Promise<PayResult>;
export type PrintView = { state: "printing" | "ok" | "fail"; error?: string | null };
export type ReadScale = () => Promise<{ grams: number; stable: boolean }>;

export function PayDialog({ total, onPay, onClose, onDone }: { total: number; onPay: OnPay; onClose: () => void; onDone: (r: { saleId: string; receiptNo: string; change: number }) => void }) {
  const [saleId] = useState(() => crypto.randomUUID()); // diyalog başına bir kez → tekrar denemede aynı satış (idempotent)
  const [cash, setCash] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [meal, setMeal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const payments: Payment[] = [];
  const add = (method: Payment["method"], v: string | null) => { const k = v === null ? null : parseTL(v); if (k) payments.push({ method, amount: k }); };
  add("nakit", cash); add("kart", card); add("yemek_karti", meal);
  const s = settle(total, payments);
  const all = (m: "nakit" | "kart" | "yemek_karti") => { const v = formatTL(total).replace(" ₺", ""); setCash(m === "nakit" ? v : ""); setCard(m === "kart" ? v : null); setMeal(m === "yemek_karti" ? v : null); };
  const submit = () => start(async () => {
    setError(null);
    try {
      const r = await onPay(saleId, payments);
      if (r.ok) onDone(r); else setError(r.error);
    } catch {
      setError("Satış kaydedilemedi. Tekrar deneyin; satış iki kez kaydedilmez.");
    }
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Ödeme" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Ödeme</h2><span className="tabular text-2xl font-bold">{formatTL(total)}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <button type="button" onClick={() => all("nakit")} className="rounded-lg border border-line px-2 py-2 hover:bg-stone-50">Tamamı nakit</button>
          <button type="button" onClick={() => all("kart")} className="rounded-lg border border-line px-2 py-2 hover:bg-stone-50">Tamamı kart</button>
          <button type="button" onClick={() => all("yemek_karti")} className="rounded-lg border border-line px-2 py-2 hover:bg-stone-50">Tamamı yemek kartı</button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3"><span className="w-28 text-sm">Alınan nakit</span><input name="amount-nakit" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="tabular flex-1 rounded-lg border border-line px-3 py-2 text-right" /></label>
          {card !== null && <label className="flex items-center gap-3"><span className="w-28 text-sm">Kart</span><input name="amount-kart" inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} className="tabular flex-1 rounded-lg border border-line px-3 py-2 text-right" /><button type="button" aria-label="Kartı kaldır" onClick={() => setCard(null)} className="px-2 text-muted">×</button></label>}
          {meal !== null && <label className="flex items-center gap-3"><span className="w-28 text-sm">Yemek kartı</span><input name="amount-yemek_karti" inputMode="decimal" value={meal} onChange={(e) => setMeal(e.target.value)} className="tabular flex-1 rounded-lg border border-line px-3 py-2 text-right" /><button type="button" aria-label="Yemek kartını kaldır" onClick={() => setMeal(null)} className="px-2 text-muted">×</button></label>}
          <div className="flex gap-3 text-sm">
            {card === null && <button type="button" onClick={() => setCard("")} className="text-brand underline">Kart ekle</button>}
            {meal === null && <button type="button" onClick={() => setMeal("")} className="text-brand underline">Yemek kartı ekle</button>}
          </div>
        </div>
        <div className="mt-4 min-h-6 text-sm font-medium" aria-live="polite">
          {s.ok ? <span className="text-emerald-700">Para üstü {formatTL(s.change)}</span> : payments.length > 0 && <span className="text-red-700">{s.error}</span>}
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-line py-3 text-sm">Vazgeç</button>
          <button type="button" disabled={!s.ok || pending} onClick={submit} className="flex-[2] rounded-lg bg-brand py-3 font-medium text-white disabled:opacity-40">{pending ? "Kaydediliyor…" : "Satışı tamamla"}</button>
        </div>
      </div>
    </div>
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
    <div role="dialog" aria-modal="true" aria-label="Tartım" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form onSubmit={(e) => { e.preventDefault(); if (g) onOk(g); }} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        <p className="tabular text-sm text-muted">{formatTL(product.price)}/kg</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="weigh-kg">Ağırlık (kg)</label>
        <input id="weigh-kg" name="kg" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="ör. 0,750" className="tabular mt-1.5 w-full rounded-lg border border-line px-3 py-3 text-right text-xl" />
        {scale && (
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => void fromScale()} disabled={reading} className="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand disabled:opacity-40">{reading ? "Okunuyor…" : "Teraziden al"}</button>
            {scaleMsg && <span className="text-sm text-red-700" role="alert">{scaleMsg}</span>}
          </div>
        )}
        <div className="tabular mt-3 min-h-6 text-right font-medium">{g ? formatTL(Math.round((product.price * g) / 1000)) : v && <span className="text-sm text-red-700">Ağırlık geçersiz.</span>}</div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-line py-3 text-sm">Vazgeç</button>
          <button type="submit" disabled={!g} className="flex-[2] rounded-lg bg-brand py-3 font-medium text-white disabled:opacity-40">Sepete ekle</button>
        </div>
      </form>
    </div>
  );
}

const MAX_SHOWN = 60;
const kg = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export function SaleScreen({ categories, products, market, onPay, onReceipt, prints = {}, onRetryPrint, scale }: { categories: { id: string; name: string }[]; products: KasaProduct[]; market: boolean; onPay: OnSale; onReceipt: (saleId: string) => void; prints?: Record<string, PrintView>; onRetryPrint?: (saleId: string) => void; scale?: ReadScale }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [weigh, setWeigh] = useState<KasaProduct | null>(null);
  const [paying, setPaying] = useState(false);
  const [last, setLast] = useState<{ saleId: string; receiptNo: string; change: number } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const t = totals(cart);
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

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <section className="flex min-h-0 flex-col">
        <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setScanError(null); }} onKeyDown={onScan} placeholder="Ürün ara ya da barkod okut (5* = 5 adet)" aria-label="Ürün ara ya da barkod okut" autoFocus className="rounded-xl border border-line px-4 py-3" />
        <p className="mb-3 mt-1 min-h-5 text-sm text-red-700" role="alert">{scanError}</p>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setCat(null)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm ${cat === null ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>{market && !q ? "Hızlı tuşlar" : "Tümü"}</button>
          {categories.map((c) => <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm ${cat === c.id ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>{c.name}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => { pick(p); refocus(); }} className="flex h-24 flex-col justify-between rounded-xl border border-line p-3 text-left hover:border-brand active:bg-brand-soft">
              <span className="font-medium leading-tight">{p.name}</span>
              <span className="tabular text-sm text-muted">{formatTL(p.price)}{p.kind === "tartili" && "/kg"}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted">{market && !q ? "Hızlı tuş yok. Barkod okutun ya da arayın." : "Ürün yok."}</p>}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col rounded-2xl border border-line">
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {cart.length === 0 && <p className="p-6 text-center text-sm text-muted">Sepet boş</p>}
          {cart.map((l) => {
            const weighed = byId.get(l.productId)?.kind === "tartili";
            return (
              <div key={l.productId} className="flex items-center gap-2 p-3" data-testid="cart-line">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{l.name}</div><div className="tabular text-xs text-muted">{weighed ? `${kg(l.qtyMilli)} × ${formatTL(l.unitPrice)}/kg` : formatTL(l.unitPrice)}</div></div>
                {weighed ? (
                  <button type="button" aria-label={`${l.name} sil`} onClick={() => setCart((c) => setQty(c, l.productId, 0))} className="rounded-lg border border-line px-2 py-1 text-xs">Sil</button>
                ) : (
                  <>
                    <button type="button" aria-label={`${l.name} azalt`} onClick={() => setCart((c) => setQty(c, l.productId, l.qtyMilli - 1000))} className="size-8 rounded-lg border border-line">−</button>
                    <span className="tabular w-8 text-center" data-testid="cart-qty">{l.qtyMilli / 1000}</span>
                    <button type="button" aria-label={`${l.name} artır`} onClick={() => setCart((c) => setQty(c, l.productId, l.qtyMilli + 1000))} className="size-8 rounded-lg border border-line">+</button>
                  </>
                )}
                <span className="tabular w-24 text-right font-medium">{formatTL(lineTotal(l))}</span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-4">
          {t.vat.map((v) => <div key={v.rate} className="tabular flex justify-between text-xs text-muted"><span>KDV %{v.rate}</span><span>{formatTL(v.vat)}</span></div>)}
          <div data-testid="cart-total" className="tabular mt-1 flex items-baseline justify-between"><span className="text-sm">TOPLAM</span><span className="text-3xl font-bold">{formatTL(t.total)}</span></div>
          {last && (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Fiş {last.receiptNo} · Para üstü {formatTL(last.change)}
              <button type="button" onClick={() => onReceipt(last.saleId)} className="ml-2 font-medium underline">Fişi yazdır</button>
              {prints[last.saleId] && (
                <div className="mt-1" data-testid="print-state" aria-live="polite">
                  {prints[last.saleId].state === "printing" && "Fiş yazdırılıyor…"}
                  {prints[last.saleId].state === "ok" && "Fiş yazdırıldı."}
                  {prints[last.saleId].state === "fail" && (
                    <span className="text-red-700">
                      Yazdırılamadı{prints[last.saleId].error ? ` (${prints[last.saleId].error})` : ""}.{" "}
                      <button type="button" onClick={() => onRetryPrint?.(last.saleId)} className="font-medium underline">Yeniden dene</button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setCart([])} disabled={!cart.length} className="rounded-xl border border-line py-4 text-sm disabled:opacity-40">Temizle</button>
            <button type="button" onClick={() => setPaying(true)} disabled={!cart.length} className="col-span-2 rounded-xl bg-brand py-4 text-lg font-semibold text-white disabled:opacity-40">Öde</button>
          </div>
        </div>
      </aside>
      {weigh && <WeighDialog product={weigh} scale={scale} onClose={() => { setWeigh(null); refocus(); }} onOk={(g) => { add(weigh, g); setWeigh(null); refocus(); }} />}
      {paying && <PayDialog total={t.total} onPay={(id, p) => onPay(id, p, cart)} onClose={() => { setPaying(false); refocus(); }} onDone={(r) => { setPaying(false); setCart([]); setLast(r); refocus(); }} />}
    </div>
  );
}
