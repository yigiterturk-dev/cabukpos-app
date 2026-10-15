"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addProduct, lineTotal, removedLines, setQty, totals, type CartLine, type RemovedLine } from "@/lib/core/cart";
import type { Currency } from "@/lib/core/money";
import { kasaFmt } from "./kasa-format";
import { settle, type Payment } from "@/lib/core/payment";
import { buildIndex, parseKg, resolveScan } from "@/lib/core/scan";
import { effectivePrice, type PriceListCore } from "@/lib/core/pricelist";
import type { KasaProduct } from "@/lib/offline/state";
import type { Buyer } from "@/lib/core/fiscal";
import { InvoiceForm } from "./InvoiceForm";
import { SmsReceiptForm } from "./SmsReceiptForm";
import { ArrowRight, Banknote, CheckCircle2, ChevronDown, CreditCard, FileText, Plus, Printer, Scale, ScanBarcode, ShoppingBasket, Trash2, Utensils, X } from "lucide-react";
import { Badge, Button, Dialog, IconButton, Kbd } from "@/components/ui";
import { capDiscount, pointsValue, type SaleExtrasInput } from "@/lib/loyalty";
import { categoryTone } from "@/lib/ui/categoryTone";
import { quickCash } from "@/lib/ui/quickCash";

export type PayResult = { ok: true; saleId: string; receiptNo: string; change: number } | { ok: false; error: string };
export type OnPay = (saleId: string, payments: Payment[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => Promise<PayResult>;
export type OnSale = (saleId: string, payments: Payment[], cart: CartLine[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => Promise<PayResult>;

type CustLoyalty = { customerId: string; name: string; points: number; enabled: boolean; kurusPerPoint: number; kurusPerRedeem: number; minRedeemPoints: number };
export type PrintView = { state: "printing" | "ok" | "fail"; error?: string | null };
export type ReadScale = () => Promise<{ grams: number; stable: boolean }>;

export function PayDialog({ total, onPay, onClose, onDone, currency }: { total: number; onPay: OnPay; onClose: () => void; onDone: (r: { saleId: string; receiptNo: string; change: number }) => void; currency?: Currency }) {
  const { TL, parse, bare } = kasaFmt({ device: { currency } });
  const [saleId] = useState(() => crypto.randomUUID()); // diyalog başına bir kez → tekrar denemede aynı satış (idempotent)
  const [cash, setCash] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [meal, setMeal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [tip, setTip] = useState<string>(""); // #49: bahşiş — toplama eklenir

  // #33: kupon / puan / hediye kartı
  const [phone, setPhone] = useState("");
  const [cust, setCust] = useState<CustLoyalty | null>(null);
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);
  const [loyaltyMsg, setLoyaltyMsg] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [redeem, setRedeem] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [gift, setGift] = useState<{ code: string; balance: number } | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);

  const tipK = tip ? parse(tip) ?? 0 : 0;
  const redeemPts = redeem ? Math.max(0, Math.trunc(Number(redeem) || 0)) : 0;
  const redeemDiscount = cust?.enabled && redeemPts >= cust.minRedeemPoints && redeemPts <= cust.points ? pointsValue(redeemPts, cust.kurusPerRedeem) : 0;
  const discount = capDiscount(total, [coupon?.discount ?? 0, redeemDiscount]);
  const grand = total - discount + tipK;
  const giftApplied = gift ? Math.min(gift.balance, grand) : 0;
  const payBase = Math.max(0, grand - giftApplied); // nakit/kart/yemek kartına kalan
  const payments: Payment[] = [];
  const add = (method: Payment["method"], v: string | null) => { const k = v === null ? null : parse(v); if (k) payments.push({ method, amount: k }); };
  add("nakit", cash); add("kart", card); add("yemek_karti", meal);
  if (giftApplied > 0) payments.push({ method: "hediye_karti", amount: giftApplied });
  const s = settle(grand, payments);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, grand - paid);
  const all = (m: "nakit" | "kart" | "yemek_karti") => { const v = bare(payBase); setCash(m === "nakit" ? v : ""); setCard(m === "kart" ? v : null); setMeal(m === "yemek_karti" ? v : null); };
  const other = (card === null ? 0 : parse(card) ?? 0) + (meal === null ? 0 : parse(meal) ?? 0);
  const due = Math.max(0, payBase - other); // nakitle kapanacak kalan
  const setCashK = (k: number) => setCash(bare(k));
  const full = bare(payBase);
  const mode = cash === full && card === null && meal === null ? "nakit" : !cash && card === full && meal === null ? "kart" : !cash && card === null && meal === full ? "yemek_karti" : null;
  const submit = () => start(async () => {
    setError(null);
    const extras: SaleExtrasInput | undefined = cust || coupon || redeemDiscount > 0 || gift
      ? {
          customerId: cust?.customerId ?? null,
          ...(coupon ? { coupon } : {}),
          ...(redeemDiscount > 0 && cust ? { loyalty: { customerId: cust.customerId, points: redeemPts, discount: redeemDiscount } } : {}),
          ...(gift && giftApplied > 0 ? { giftCard: { code: gift.code, amount: giftApplied } } : {}),
        }
      : undefined;
    try {
      const r = await onPay(saleId, payments, buyer, tipK, extras);
      if (r.ok) onDone(r); else setError(r.error);
    } catch {
      setError("Satış kaydedilemedi. Tekrar deneyin; satış iki kez kaydedilmez.");
    }
  });
  const submitFromAmount = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || pending || invoicing || !s.ok) return;
    e.preventDefault();
    submit();
  };

  const lookupCustomer = async () => {
    setLoyaltyBusy(true); setLoyaltyMsg(null);
    try {
      const res = await fetch(`/api/kasa/loyalty?phone=${encodeURIComponent(phone.trim())}`, { cache: "no-store" });
      const data = (await res.json()) as { customer: CustLoyalty | null };
      setCust(data.customer);
      setLoyaltyMsg(data.customer ? (data.customer.enabled ? null : "Sadakat programı kapalı.") : "Kayıtlı müşteri bulunamadı.");
    } catch { setLoyaltyMsg("Çevrimiçi değil; sadakat kullanılamıyor."); }
    setLoyaltyBusy(false);
  };
  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setLoyaltyBusy(true); setLoyaltyMsg(null);
    try {
      const q = new URLSearchParams({ coupon: code, subtotal: String(total) });
      if (cust?.customerId) q.set("customer", cust.customerId);
      const res = await fetch(`/api/kasa/loyalty?${q}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; discount?: number; reason?: string };
      if (data.ok && typeof data.discount === "number") setCoupon({ code, discount: data.discount });
      else { setCoupon(null); setLoyaltyMsg(data.reason ?? "Kupon uygulanamadı."); }
    } catch { setLoyaltyMsg("Çevrimiçi değil."); }
    setLoyaltyBusy(false);
  };
  const applyGift = async () => {
    const code = giftCode.trim().toUpperCase();
    if (!code) return;
    setLoyaltyBusy(true); setLoyaltyMsg(null);
    try {
      const res = await fetch(`/api/kasa/loyalty?gift=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; balance?: number; reason?: string };
      if (data.ok && typeof data.balance === "number") setGift({ code, balance: data.balance });
      else { setGift(null); setLoyaltyMsg(data.reason ?? "Hediye kartı bulunamadı."); }
    } catch { setLoyaltyMsg("Çevrimiçi değil."); }
    setLoyaltyBusy(false);
  };

  const METHODS = [
    { m: "nakit" as const, label: "Tamamı nakit", Icon: Banknote },
    { m: "kart" as const, label: "Tamamı kart", Icon: CreditCard },
    { m: "yemek_karti" as const, label: "Tamamı yemek kartı", Icon: Utensils },
  ];
  const amount = "tabular h-14 flex-1 rounded-xl border border-line bg-surface px-4 text-right text-2xl font-semibold outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50";
  return (
    <Dialog label="Ödeme" title="Ödeme" size="lg" aside={<span aria-live="polite" className="flex flex-col items-end gap-0.5"><span className="text-xs font-medium text-muted">Ödenecek</span><span className="tabular font-display text-3xl font-extrabold tracking-tight">{TL(grand)}</span></span>} onClose={onClose}
      footer={<>
        <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">Vazgeç</Button>
        <Button size="lg" disabled={!s.ok || pending || invoicing} onClick={submit} className="flex-[2]">{pending ? "Kaydediliyor…" : "Satışı tamamla"}</Button>
      </>}>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {METHODS.map(({ m, label, Icon }) => (
              <button key={m} type="button" onClick={() => all(m)} aria-pressed={mode === m}
                className={`press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-center text-sm font-medium outline-none transition-[background-color,border-color,box-shadow] duration-[var(--dur-base)] focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${mode === m ? "border-brand bg-brand-soft text-brand ring-2 ring-brand-ring" : "border-line bg-surface shadow-rest hover:border-line-strong hover:bg-surface-2"}`}>
                <Icon aria-hidden className="size-6" />{label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3"><span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Alınan nakit</span><input name="amount-nakit" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} onKeyDown={submitFromAmount} placeholder="0,00" className={`${amount} min-w-0`} /></label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Bahşiş</span>
            <input name="amount-bahsis" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} onKeyDown={submitFromAmount} placeholder="0,00" aria-label="Bahşiş tutarı" className={`${amount} min-w-0 flex-1`} />
            <div className="flex shrink-0 gap-1">
              {[10, 15].map((p) => (
                <Button key={p} variant="secondary" size="sm" type="button" className="min-h-12" onClick={() => setTip(bare(Math.round((total * p) / 100)))}>{`%${p}`}</Button>
              ))}
              {tip && <IconButton label="Bahşişi kaldır" onClick={() => setTip("")}><X aria-hidden className="size-5" /></IconButton>}
            </div>
          </div>
          {due > 0 && (
            <div className="flex flex-wrap gap-2 pl-[7.75rem]">
              <Button variant="secondary" size="sm" className="min-h-12" onClick={() => setCashK(due)}>Tam tutar</Button>
              {quickCash(due).map((k) => <Button key={k} variant="secondary" size="sm" className="min-h-12 tabular" onClick={() => setCashK(k)}>{bare(k).replace(",00", "")}</Button>)}
            </div>
          )}
          {card !== null && <label className="flex items-center gap-3"><span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Kart</span><input name="amount-kart" inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} onKeyDown={submitFromAmount} className={`${amount} min-w-0`} /><IconButton label="Kartı kaldır" onClick={() => setCard(null)}><X aria-hidden className="size-5" /></IconButton></label>}
          {meal !== null && <label className="flex items-center gap-3"><span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Yemek kartı</span><input name="amount-yemek_karti" inputMode="decimal" value={meal} onChange={(e) => setMeal(e.target.value)} onKeyDown={submitFromAmount} className={`${amount} min-w-0`} /><IconButton label="Yemek kartını kaldır" onClick={() => setMeal(null)}><X aria-hidden className="size-5" /></IconButton></label>}
          <div className="flex flex-wrap gap-2 pt-1">
            {card === null && <Button variant="ghost" size="sm" className="min-h-12" onClick={() => setCard("")}><Plus aria-hidden className="size-4" />Kart ekle</Button>}
            {meal === null && <Button variant="ghost" size="sm" className="min-h-12" onClick={() => setMeal("")}><Plus aria-hidden className="size-4" />Yemek kartı ekle</Button>}
            {!invoicing && <Button variant="ghost" size="sm" className="min-h-12" onClick={() => setInvoicing(true)}><FileText aria-hidden className="size-4" />Fatura</Button>}
            {buyer && !invoicing && <span className="inline-flex max-w-full break-words rounded-full bg-brand-soft px-2.5 text-sm text-brand" data-testid="buyer-badge">{buyer.name}</span>}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-surface-2/60 p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-2">Müşteri ve avantajlar</p>
              <p className="truncate text-xs text-muted" title={cust?.name ?? (discount > 0 || giftApplied > 0 ? "Avantaj uygulandı" : "İsteğe bağlı")}>{cust ? cust.name : discount > 0 || giftApplied > 0 ? "Avantaj uygulandı" : "İsteğe bağlı"}</p>
            </div>
            <Button variant="ghost" size="sm" type="button" className="min-h-12" onClick={() => setExtrasOpen((open) => !open)} aria-expanded={extrasOpen}>
              {extrasOpen ? "Gizle" : "Aç"}<ChevronDown aria-hidden className={`size-4 transition-transform ${extrasOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          {(extrasOpen || cust || discount > 0 || giftApplied > 0 || loyaltyMsg) && <div className="mt-3">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Müşteri telefonu" aria-label="Müşteri telefonu" className="min-h-12 min-w-0 w-full rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring/50" />
            <Button variant="secondary" size="sm" type="button" className="min-h-12" disabled={loyaltyBusy || !phone.trim()} onClick={() => void lookupCustomer()}>{loyaltyBusy ? "Aranıyor…" : "Müşteri bul"}</Button>
          </div>
          {cust && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 break-words font-medium">{cust.name}</span>
              <Badge tone="brand">{cust.points} puan</Badge>
              {cust.enabled && cust.points >= cust.minRedeemPoints && (
                <label className="flex items-center gap-1.5 text-ink-2">
                  Kullan
                  <input value={redeem} onChange={(e) => setRedeem(e.target.value)} inputMode="numeric" placeholder="0" aria-label="Harcanacak puan" className="tabular min-h-12 w-16 rounded-lg border border-line bg-surface px-2 text-right text-sm outline-none focus:border-brand" />
                  puan
                </label>
              )}
            </div>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2">
              <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Kupon kodu" aria-label="Kupon kodu" className="min-h-12 min-w-0 w-full rounded-lg border border-line bg-surface px-2.5 text-sm uppercase outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring/50" />
              <Button variant="secondary" size="sm" type="button" className="min-h-12" disabled={loyaltyBusy || !couponCode.trim()} onClick={() => void applyCoupon()}>{loyaltyBusy ? "Uygulanıyor…" : "Kupon"}</Button>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <input value={giftCode} onChange={(e) => setGiftCode(e.target.value)} placeholder="Hediye kartı" aria-label="Hediye kartı kodu" className="min-h-12 min-w-0 w-full rounded-lg border border-line bg-surface px-2.5 text-sm uppercase outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring/50" />
              <Button variant="secondary" size="sm" type="button" className="min-h-12" disabled={loyaltyBusy || !giftCode.trim()} onClick={() => void applyGift()}>{loyaltyBusy ? "Kontrol ediliyor…" : "Kart"}</Button>
            </div>
          </div>
          {(discount > 0 || giftApplied > 0) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ok">
              {discount > 0 && <span>İndirim: −{TL(discount)}</span>}
              {giftApplied > 0 && <span>Hediye kartı: −{TL(giftApplied)}</span>}
            </div>
          )}
          {loyaltyMsg && <p className="mt-2 break-words text-xs text-warn" role="status">{loyaltyMsg}</p>}
          </div>}
        </div>
      </div>
      {invoicing && <InvoiceForm initial={buyer} onSave={(b) => { setBuyer(b); setInvoicing(false); }} onCancel={() => { setBuyer(null); setInvoicing(false); }} />}
      <div className="mt-5" aria-live="polite">
        {s.ok ? (
          <div className="flex items-baseline justify-between rounded-xl bg-ok-soft px-4 py-3 text-ok"><span className="font-medium">Para üstü</span>{" "}<span className="tabular text-2xl font-bold">{TL(s.change)}</span></div>
        ) : payments.length > 0 ? (
          <div className="rounded-xl bg-warn-soft px-4 py-3 text-warn" role="status" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Kalan tutar</span>
              <span className="tabular text-xl font-bold">{TL(remaining)}</span>
            </div>
            <p className="mt-1 text-xs">{s.error}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-3 px-4 py-3 text-sm text-muted">Ödeme yöntemini seçin ya da alınan tutarı girin.</div>
        )}
      </div>
      {error && <p className="mt-3 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
    </Dialog>
  );
}

function WeighDialog({ product, onOk, onClose, scale, currency }: { product: KasaProduct; onOk: (grams: number) => void; onClose: () => void; scale?: ReadScale; currency?: Currency }) {
  const { TL } = kasaFmt({ device: { currency } });
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
    <Dialog label="Tartım" title={product.name} aside={<span className="tabular text-sm text-muted">{TL(product.price)}/kg</span>} onClose={onClose} size="sm"
      footer={<>
        <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">Vazgeç</Button>
        <Button type="submit" form="weigh-form" size="lg" disabled={!g} className="flex-[2]">Sepete ekle</Button>
      </>}>
      <form id="weigh-form" onSubmit={(e) => { e.preventDefault(); if (g) onOk(g); }}>
        <label className="block text-sm font-medium text-ink-2" htmlFor="weigh-kg">Ağırlık (kg)</label>
        <input id="weigh-kg" name="kg" autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="ör. 0,750" className="tabular mt-1.5 h-16 w-full rounded-xl border border-line px-4 text-right text-3xl font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        {scale && (
          <div className="mt-3 flex items-center gap-3">
            <Button variant="secondary" onClick={() => void fromScale()} disabled={reading} className="min-h-12"><Scale aria-hidden className="size-4" />{reading ? "Okunuyor…" : "Teraziden al"}</Button>
            {scaleMsg && <span className="break-words text-sm text-bad" role="alert" aria-live="assertive">{scaleMsg}</span>}
          </div>
        )}
        <div className="tabular mt-4 min-h-8 text-right text-2xl font-bold">{g ? TL(Math.round((product.price * g) / 1000)) : v && <span className="text-sm font-medium text-bad">Ağırlık geçersiz.</span>}</div>
      </form>
    </Dialog>
  );
}

const MAX_SHOWN = 60;
const kg = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export function SaleScreen({ categories, products, priceLists = [], market, onPay, onReceipt, prints = {}, onRetryPrint, scale, onRemove, currency }: { categories: { id: string; name: string }[]; products: KasaProduct[]; priceLists?: PriceListCore[]; market: boolean; onPay: OnSale; onReceipt: (saleId: string) => void; prints?: Record<string, PrintView>; onRetryPrint?: (saleId: string) => void; scale?: ReadScale; onRemove?: (type: "line_removed" | "cart_cleared", lines: RemovedLine[]) => void; currency?: Currency }) {
  const { TL } = kasaFmt({ device: { currency } });
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
  // #50: fiyat satır eklenirken donar — happy hour bitse de sepetteki satır değişmez.
  const add = (p: KasaProduct, qtyMilli = 1000) => { setCart((c) => addProduct(c, { ...p, price: effectivePrice(p.id, p.price, priceLists, new Date(), undefined, p.categoryId) }, qtyMilli)); setLast(null); setScanError(null); };
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
  const chip = (on: boolean) => `press inline-flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand text-white shadow-card" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`;

  return (
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Yeni satış</h1>
            <p className="text-xs text-muted">Ürünü seçin veya barkodu okutun.</p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex"><Kbd>F2</Kbd> ara · <Kbd>Enter</Kbd> ekle</span>
        </div>
        <div className="relative">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setScanError(null); }} onKeyDown={onScan} placeholder="Ürün ara ya da barkod okut (5* = 5 adet)" aria-label="Ürün ara ya da barkod okut" autoFocus
            className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-4 text-base shadow-card outline-none transition placeholder:text-muted hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        </div>
        <div className="mb-2 mt-1 flex min-h-5 items-center justify-between gap-3 px-1">
          <p className="break-words text-sm font-medium text-bad" role="alert" aria-live="assertive">{scanError}</p>
          {!scanError && <span className="text-xs text-muted">{shown.length}{shown.length === MAX_SHOWN ? "+" : ""} ürün gösteriliyor{shown.length === MAX_SHOWN && " · aramayı daraltın"}</span>}
        </div>
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setCat(null)} className={chip(cat === null)}>{market && !q ? "Hızlı tuşlar" : "Tümü"}</button>
          {categories.map((c) => <button key={c.id} type="button" title={c.name} onClick={() => setCat(c.id)} className={chip(cat === c.id)}><span aria-hidden className={`size-2.5 rounded-full ${categoryTone(c.id).dot}`} />{c.name}</button>)}
        </div>
        <div className="grid auto-rows-[7rem] grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.map((p) => {
            const n = inCart.get(p.id);
            return (
              <button key={p.id} type="button" onClick={() => { pick(p); refocus(); }}
                className={`press group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border bg-surface p-3.5 pt-4 text-left shadow-rest outline-none transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${n ? "border-brand ring-2 ring-brand-ring" : "border-line"}`}>
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${categoryTone(p.categoryId).stripe}`} />
                <span title={p.name} className="line-clamp-2 pr-7 font-display text-[15px] font-semibold leading-snug">{p.name}</span>
                <span className="tabular mt-auto flex items-baseline gap-1 pt-2 text-[15px] font-semibold text-ink-2">{TL(p.price)}{p.kind === "tartili" && <span className="text-xs font-medium text-muted">/kg</span>}</span>
                {n !== undefined && <span aria-hidden className="tabular absolute right-2.5 top-3 grid min-w-7 place-items-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-white shadow-rest">{p.kind === "tartili" ? <Scale className="size-3.5" /> : n / 1000}</span>}
              </button>
            );
          })}
          {shown.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center gap-2 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-3 text-line-strong"><ShoppingBasket aria-hidden className="size-6" /></span>
              <p className="text-sm text-muted">{market && !q ? "Hızlı tuş yok. Barkod okutun ya da arayın." : "Ürün bulunamadı."}</p>
            </div>
          )}
        </div>
      </section>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-raised lg:sticky lg:top-2">
        <div className="flex items-center justify-between border-b border-line bg-surface-2/50 px-4 py-3">
          <h2 className="font-semibold">Sepet{cart.length > 0 ? ` · ${count.toLocaleString("tr-TR")} kalem` : ""}</h2>
        </div>
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {cart.length === 0 && (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-surface-3 text-line-strong"><ShoppingBasket aria-hidden className="size-7" /></span>
              <div>
                <p className="font-medium text-ink-2">Sepet boş</p>
                <p className="mt-0.5 text-xs text-muted">Ürün seçin ya da barkod okutun.</p>
              </div>
            </div>
          )}
          {cart.map((l) => {
            const weighed = byId.get(l.productId)?.kind === "tartili";
            const step = "press grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60";
            return (
              <div key={l.productId} className="flex flex-wrap items-center gap-2 px-4 py-2.5" data-testid="cart-line">
                <div className="min-w-0 basis-full flex-1 sm:basis-auto"><div className="truncate font-medium" title={l.name}>{l.name}</div><div className="tabular text-xs text-muted">{weighed ? `${kg(l.qtyMilli)} × ${TL(l.unitPrice)}/kg` : TL(l.unitPrice)}</div></div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {weighed ? (
                    <button type="button" aria-label={`${l.name} sil`} onClick={() => shrink(setQty(cart, l.productId, 0))} className={`${step} text-bad`}><Trash2 aria-hidden className="size-4" /></button>
                  ) : (
                    <>
                      <button type="button" aria-label={`${l.name} azalt`} onClick={() => shrink(setQty(cart, l.productId, l.qtyMilli - 1000))} className={step}>−</button>
                      <span className="tabular w-8 text-center font-semibold" data-testid="cart-qty">{l.qtyMilli / 1000}</span>
                      <button type="button" aria-label={`${l.name} artır`} onClick={() => setCart((c) => setQty(c, l.productId, l.qtyMilli + 1000))} className={step}>+</button>
                    </>
                  )}
                  <span className="tabular w-24 shrink-0 text-right font-semibold">{TL(lineTotal(l))}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 shrink-0 border-t border-line bg-surface p-4 shadow-[0_-10px_22px_-18px_rgb(40_24_8/0.55)]">
          {t.vat.map((v) => <div key={v.rate} className="tabular flex justify-between text-xs text-muted"><span>KDV %{v.rate}</span><span>{TL(v.vat)}</span></div>)}
          <div data-testid="cart-total" className="tabular mt-1.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Toplam</span>
            <span className="font-display text-4xl font-extrabold tracking-tight">{TL(t.total)}</span>
          </div>
          {last && (
            <div className="mt-3 rounded-xl border border-ok/30 bg-ok-soft p-3 text-sm text-ok" role="status" aria-live="polite">
              <div className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Satış tamamlandı</span>
                  <span className="block text-xs text-ok/80">Fiş {last.receiptNo} · Para üstü {TL(last.change)}</span>
                </span>
                <Button variant="secondary" size="sm" disabled={prints[last.saleId]?.state === "printing"} onClick={() => onReceipt(last.saleId)} className="min-h-12 shrink-0">
                  <Printer aria-hidden className="size-4" />{prints[last.saleId]?.state === "printing" ? "Yazdırılıyor…" : prints[last.saleId]?.state === "ok" ? "Tekrar yazdır" : "Fişi yazdır"}
                </Button>
              </div>
              {prints[last.saleId] && (
                <div className="mt-1.5 pl-7" data-testid="print-state" aria-live="polite">
                  {prints[last.saleId].state === "printing" && "Fiş yazdırılıyor…"}
                  {prints[last.saleId].state === "ok" && "Fiş yazdırıldı."}
                  {prints[last.saleId].state === "fail" && (
                    <span className="text-bad">
                      Yazdırılamadı{prints[last.saleId].error ? ` (${prints[last.saleId].error})` : ""}.{" "}
                      <button type="button" onClick={() => onRetryPrint?.(last.saleId)} className="inline-flex min-h-12 items-center rounded-lg px-2 font-medium underline outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yeniden dene</button>
                    </span>
                  )}
                </div>
              )}
              <SmsReceiptForm saleId={last.saleId} />
            </div>
          )}
          <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-2">
            <Button variant="secondary" size="xl" onClick={clear} disabled={!cart.length} className="min-w-0 !text-base !font-medium"><Trash2 aria-hidden className="size-5" />Temizle</Button>
            <Button size="xl" onClick={() => setPaying(true)} disabled={!cart.length} className="min-w-0 text-xl">Öde{cart.length > 0 && <span aria-hidden className="tabular ml-1 hidden font-bold opacity-90 sm:inline">· {TL(t.total)}</span>}<ArrowRight aria-hidden className="size-6" /></Button>
          </div>
        </div>
      </aside>
      {weigh && <WeighDialog product={weigh} scale={scale} currency={currency} onClose={() => { setWeigh(null); refocus(); }} onOk={(g) => { add(weigh, g); setWeigh(null); refocus(); }} />}
      {paying && <PayDialog total={t.total} currency={currency} onPay={(id, p, b, tip) => onPay(id, p, cart, b, tip)} onClose={() => { setPaying(false); refocus(); }} onDone={(r) => { setPaying(false); setCart([]); setLast(r); refocus(); }} />}
    </div>
  );
}
