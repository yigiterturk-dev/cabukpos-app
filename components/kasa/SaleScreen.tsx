"use client";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { addProduct, lineTotal, MAX_CART_LINE_QTY_MILLI, removedLines, setQty, totals, type CartLine, type RemovedLine } from "@/lib/core/cart";
import type { Currency } from "@/lib/core/money";
import { currencyUnit, kasaFmt } from "./kasa-format";
import { MAX_PAYMENT_KURUS, settle, type Payment } from "@/lib/core/payment";
import { buildIndex, parseKg, resolveScan } from "@/lib/core/scan";
import { normalizeSearchText } from "@/lib/core/search";
import { effectivePrice, type PriceListCore } from "@/lib/core/pricelist";
import type { KasaProduct } from "@/lib/offline/state";
import type { Buyer } from "@/lib/core/fiscal";
import { InvoiceForm } from "./InvoiceForm";
import { SmsReceiptForm } from "./SmsReceiptForm";
import { ArrowRight, Banknote, CheckCircle2, ChevronDown, ChevronRight, CreditCard, FileText, Plus, Printer, Scale, ScanBarcode, ShoppingBasket, Trash2, Utensils, X } from "lucide-react";
import { Badge, Button, Dialog, IconButton, Kbd } from "@/components/ui";
import { capDiscount, pointsValue, type SaleExtrasInput } from "@/lib/loyalty";
import { categoryTone } from "@/lib/ui/categoryTone";
import { quickCash } from "@/lib/ui/quickCash";
import { useKasaMainProps } from "./KasaPreviewContext";

export type PayResult = { ok: true; saleId: string; receiptNo: string; change: number } | { ok: false; error: string };
export type OnPay = (saleId: string, payments: Payment[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => Promise<PayResult>;
export type OnSale = (saleId: string, payments: Payment[], cart: CartLine[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => Promise<PayResult>;

type CustLoyalty = { customerId: string; name: string; points: number; enabled: boolean; kurusPerPoint: number; kurusPerRedeem: number; minRedeemPoints: number };
async function apiFailure(res: Response, fallback: string) {
  const body = await res.json().catch(() => null) as { error?: unknown } | null;
  if (res.status === 429 && typeof body?.error === "string") return body.error;
  if (res.status === 401 || res.status === 403) return "Kasa oturumu doğrulanamadı. Sayfayı yenileyin veya yöneticinize başvurun.";
  return fallback;
}
const connectionFailure = () => navigator.onLine ? "Sunucuya ulaşılamadı. Bağlantıyı kontrol edip tekrar deneyin." : "Çevrimdışı; bu işlem için bağlantı gerekiyor.";
const MAX_TIP_KURUS = 1_000_000;
export type PrintView = { state: "printing" | "ok" | "fail"; error?: string | null };
export type ReadScale = () => Promise<{ grams: number; stable: boolean }>;

export function PayDialog({ total, onPay, onClose, onDone, currency }: { total: number; onPay: OnPay; onClose: () => void; onDone: (r: { saleId: string; receiptNo: string; change: number }) => void; currency?: Currency }) {
  const { TL, parse, bare } = kasaFmt({ device: { currency } });
  const amountErrorId = useId();
  const submitButtonId = useId();
  const tipInputId = useId();
  const extrasPanelId = useId();
  const customerPhoneInputId = useId();
  const couponInputId = useId();
  const giftInputId = useId();
  const [saleId] = useState(() => crypto.randomUUID()); // diyalog başına bir kez → tekrar denemede aynı satış (idempotent)
  const [cash, setCash] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [meal, setMeal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [invoiceNotice, setInvoiceNotice] = useState("");
  const [settlementNotice, setSettlementNotice] = useState("");
  const invoiceToggleRef = useRef<HTMLButtonElement>(null);
  const cardAmountRef = useRef<HTMLInputElement>(null);
  const mealAmountRef = useRef<HTMLInputElement>(null);
  const addCardRef = useRef<HTMLButtonElement>(null);
  const addMealRef = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<string>(""); // #49: bahşiş — toplama eklenir

  // #33: kupon / puan / hediye kartı
  const [phone, setPhone] = useState("");
  const [cust, setCust] = useState<CustLoyalty | null>(null);
  const [loyaltyBusy, setLoyaltyBusy] = useState<"customer" | "coupon" | "gift" | null>(null);
  const [loyaltyMsg, setLoyaltyMsg] = useState<string | null>(null);
  const [loyaltyNoticeTone, setLoyaltyNoticeTone] = useState<"ok" | "warn">("warn");
  const loyaltyActionRef = useRef<HTMLElement | null>(null);
  const loyaltyNoticeRef = useRef<HTMLParagraphElement>(null);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; customerId: string | null } | null>(null);
  const [redeem, setRedeem] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [gift, setGift] = useState<{ code: string; balance: number } | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);

  useEffect(() => {
    if (loyaltyBusy) return;
    const target = loyaltyActionRef.current;
    if (!target) return;
    loyaltyActionRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (target.isConnected && !target.matches(":disabled")) target.focus();
      else loyaltyNoticeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loyaltyBusy]);

  const tipParsed = tip.trim() === "" ? 0 : parse(tip);
  const tipK = tipParsed ?? 0;
  const tipInvalid = tip.trim() !== "" && (tipParsed === null || tipParsed > MAX_TIP_KURUS);
  const cashParsed = cash.trim() ? parse(cash) : null;
  const cardParsed = card?.trim() ? parse(card) : null;
  const mealParsed = meal?.trim() ? parse(meal) : null;
  const cashInvalid = cash.trim() !== "" && (cashParsed === null || cashParsed > MAX_PAYMENT_KURUS);
  const cardInvalid = card !== null && card.trim() !== "" && (cardParsed === null || cardParsed > MAX_PAYMENT_KURUS);
  const mealInvalid = meal !== null && meal.trim() !== "" && (mealParsed === null || mealParsed > MAX_PAYMENT_KURUS);
  const invalidAmount = tipInvalid || cashInvalid || cardInvalid || mealInvalid;
  const redeemPts = redeem ? Number(redeem) : 0;
  const redeemError = cust?.enabled && redeem.trim() !== ""
    ? !/^\d+$/.test(redeem.trim()) ? "Puan sayısını tam sayı olarak girin."
      : redeemPts > cust.points ? `En fazla ${cust.points} puan kullanabilirsiniz.`
        : redeemPts > 0 && redeemPts < cust.minRedeemPoints ? `En az ${cust.minRedeemPoints} puan kullanabilirsiniz.`
          : null
    : null;
  const redeemDiscount = cust?.enabled && !redeemError && redeemPts >= cust.minRedeemPoints && redeemPts <= cust.points ? pointsValue(redeemPts, cust.kurusPerRedeem) : 0;
  const discount = capDiscount(total, [coupon?.discount ?? 0, redeemDiscount]);
  const grand = total - discount + tipK;
  const giftApplied = gift ? Math.min(gift.balance, grand, MAX_PAYMENT_KURUS) : 0;
  const payBase = Math.max(0, grand - giftApplied); // nakit/kart/yemek kartına kalan
  const payments: Payment[] = [];
  const add = (method: Payment["method"], v: string | null) => { const k = v === null ? null : parse(v); if (k) payments.push({ method, amount: k }); };
  add("nakit", cash); add("kart", card); add("yemek_karti", meal);
  if (giftApplied > 0) payments.push({ method: "hediye_karti", amount: giftApplied });
  const s = settle(grand, payments);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, grand - paid);
  const settlementError = s.ok ? null : s.error.startsWith("Eksik ödeme:") ? `Eksik ödeme: ${TL(remaining)}` : s.error;
  const settlementAnnouncement = invalidAmount
    ? [
        cashInvalid ? cashParsed === null ? "Alınan nakit tutarı biçimi geçersiz." : `Nakit ödemesi en fazla ${TL(MAX_PAYMENT_KURUS)} olabilir.` : "",
        cardInvalid ? cardParsed === null ? "Kart tutarı biçimi geçersiz." : `Kart ödemesi en fazla ${TL(MAX_PAYMENT_KURUS)} olabilir.` : "",
        mealInvalid ? mealParsed === null ? "Yemek kartı tutarı biçimi geçersiz." : `Yemek kartı ödemesi en fazla ${TL(MAX_PAYMENT_KURUS)} olabilir.` : "",
        tipInvalid ? tipParsed === null ? "Bahşiş tutarının biçimi geçersiz." : `Bahşiş en fazla ${TL(MAX_TIP_KURUS)} olabilir.` : "",
      ].filter(Boolean).join(" ") + " Nokta veya virgülle en fazla iki ondalık hane kullanın."
    : s.ok
    ? `Ödenecek ${TL(grand)}. Para üstü ${TL(s.change)}.`
    : `Ödenecek ${TL(grand)}.${payments.length > 0 ? ` ${settlementError ?? ""}` : ""}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setSettlementNotice(settlementAnnouncement), 500);
    return () => window.clearTimeout(timer);
  }, [settlementAnnouncement]);
  useEffect(() => {
    if (!error || pending) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(submitButtonId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [error, pending, submitButtonId]);
  const all = (m: "nakit" | "kart" | "yemek_karti") => { setError(null); const v = bare(payBase); setCash(m === "nakit" ? v : ""); setCard(m === "kart" ? v : null); setMeal(m === "yemek_karti" ? v : null); };
  const other = (card === null ? 0 : parse(card) ?? 0) + (meal === null ? 0 : parse(meal) ?? 0);
  const due = Math.max(0, payBase - other); // nakitle kapanacak kalan
  const setCashK = (k: number) => { setError(null); setCash(bare(k)); };
  const full = bare(payBase);
  const mode = payBase > 0 && (cash === full && card === null && meal === null ? "nakit" : !cash && card === full && meal === null ? "kart" : !cash && card === null && meal === full ? "yemek_karti" : null);
  const extrasSummary = [
    cust?.name,
    coupon ? `Kupon ${coupon.code}` : null,
    redeemDiscount > 0 ? `${redeemPts} puan` : null,
    gift ? `Hediye kartı ${gift.code}` : null,
  ].filter(Boolean).join(" · ") || "İsteğe bağlı";
  const closeInvoice = (nextBuyer: Buyer | null, notice: string) => {
    setBuyer(nextBuyer);
    setInvoicing(false);
    setInvoiceNotice(notice);
    requestAnimationFrame(() => invoiceToggleRef.current?.focus());
  };
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
    if (e.key !== "Enter" || pending || invoicing || loyaltyBusy !== null || invalidAmount || !s.ok) return;
    e.preventDefault();
    submit();
  };

  const lookupCustomer = async (trigger: HTMLButtonElement) => {
    loyaltyActionRef.current = trigger;
    setLoyaltyBusy("customer"); setLoyaltyMsg(null);
    try {
      const res = await fetch(`/api/kasa/loyalty?phone=${encodeURIComponent(phone.trim())}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        setCust(null);
        setRedeem("");
        if (coupon?.customerId) setCoupon(null);
        setLoyaltyNoticeTone("warn");
        setLoyaltyMsg(await apiFailure(res, "Müşteri aranamadı. Tekrar deneyin."));
      } else {
        const data = (await res.json()) as { customer: CustLoyalty | null };
        setCust(data.customer);
        setRedeem("");
        if (coupon?.customerId && coupon.customerId !== data.customer?.customerId) setCoupon(null);
        if (data.customer?.enabled) {
          setLoyaltyNoticeTone("ok");
          setLoyaltyMsg(`Müşteri bulundu: ${data.customer.name}. ${data.customer.points} puan.`);
        } else {
          setLoyaltyNoticeTone("warn");
          setLoyaltyMsg(data.customer ? "Müşteri bulundu ancak sadakat programı kapalı." : "Kayıtlı müşteri bulunamadı.");
        }
      }
    } catch {
      setCust(null);
      setRedeem("");
      if (coupon?.customerId) setCoupon(null);
      setLoyaltyNoticeTone("warn");
      setLoyaltyMsg(connectionFailure());
    }
    setLoyaltyBusy(null);
  };
  const applyCoupon = async (trigger: HTMLButtonElement) => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    loyaltyActionRef.current = trigger;
    setCoupon(null);
    setLoyaltyBusy("coupon"); setLoyaltyMsg(null);
    try {
      const q = new URLSearchParams({ coupon: code, subtotal: String(total) });
      if (cust?.customerId) q.set("customer", cust.customerId);
      const res = await fetch(`/api/kasa/loyalty?${q}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        setCoupon(null);
        setLoyaltyNoticeTone("warn");
        setLoyaltyMsg(await apiFailure(res, "Kupon doğrulanamadı. Tekrar deneyin."));
        setLoyaltyBusy(null);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; discount?: number; reason?: string };
      if (data.ok && typeof data.discount === "number") {
        setCoupon({ code, discount: data.discount, customerId: cust?.customerId ?? null });
        setLoyaltyNoticeTone("ok");
        setLoyaltyMsg(`${code} kuponu uygulandı. İndirim: ${TL(data.discount)}.`);
      } else { setCoupon(null); setLoyaltyNoticeTone("warn"); setLoyaltyMsg(data.reason ?? "Kupon uygulanamadı."); }
    } catch { setCoupon(null); setLoyaltyNoticeTone("warn"); setLoyaltyMsg(connectionFailure()); }
    setLoyaltyBusy(null);
  };
  const applyGift = async (trigger: HTMLButtonElement) => {
    const code = giftCode.trim().toUpperCase();
    if (!code) return;
    loyaltyActionRef.current = trigger;
    setGift(null);
    setLoyaltyBusy("gift"); setLoyaltyMsg(null);
    try {
      const res = await fetch(`/api/kasa/loyalty?gift=${encodeURIComponent(code)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        setGift(null);
        setLoyaltyNoticeTone("warn");
        setLoyaltyMsg(await apiFailure(res, "Hediye kartı bakiyesi doğrulanamadı. Tekrar deneyin."));
        setLoyaltyBusy(null);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; balance?: number; reason?: string };
      if (data.ok && typeof data.balance === "number") {
        setGift({ code, balance: data.balance });
        setLoyaltyNoticeTone("ok");
        setLoyaltyMsg(`Hediye kartı bulundu. Bakiye: ${TL(data.balance)}.`);
      } else { setGift(null); setLoyaltyNoticeTone("warn"); setLoyaltyMsg(data.reason ?? "Hediye kartı bulunamadı."); }
    } catch { setGift(null); setLoyaltyNoticeTone("warn"); setLoyaltyMsg(connectionFailure()); }
    setLoyaltyBusy(null);
  };

  const METHODS = [
    { m: "nakit" as const, label: giftApplied ? "Kalanı nakit" : "Tamamı nakit", Icon: Banknote },
    { m: "kart" as const, label: giftApplied ? "Kalanı kart" : "Tamamı kart", Icon: CreditCard },
    { m: "yemek_karti" as const, label: giftApplied ? "Kalanı yemek kartı" : "Tamamı yemek kartı", Icon: Utensils },
  ];
  const amount = "tabular h-14 flex-1 rounded-xl border border-line bg-surface px-4 text-right text-2xl font-semibold outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50";
  return (
    <Dialog label="Ödeme" title="Ödeme" size="lg" closeDisabled={pending} aside={<span className="flex flex-col items-end gap-0.5"><span className="text-xs font-medium text-muted">Ödenecek</span><span className="tabular font-display text-3xl font-extrabold tracking-tight">{TL(grand)}</span></span>} onClose={onClose}
      footer={<>
        {loyaltyBusy && <p className="basis-full text-xs text-muted">Müşteri avantajı doğrulanırken ödeme bilgileri kilitli.</p>}
        <Button variant="secondary" size="lg" disabled={pending} onClick={onClose} className="flex-1">Vazgeç</Button>
        <Button id={submitButtonId} size="lg" disabled={!s.ok || pending || invoicing || loyaltyBusy !== null || invalidAmount} onClick={submit} className="flex-[2]">{pending ? "Kaydediliyor…" : "Satışı tamamla"}</Button>
      </>}>
      <fieldset disabled={pending || loyaltyBusy !== null} aria-busy={pending || loyaltyBusy !== null} className="m-0 grid min-w-0 gap-5 border-0 p-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div role="group" aria-label={giftApplied ? "Hediye kartından kalan tutar için ödeme yöntemi" : "Ödeme yöntemini seçin"} className="grid gap-2 sm:grid-cols-3">
            {METHODS.map(({ m, label, Icon }) => (
              <button key={m} type="button" disabled={payBase <= 0} onClick={() => all(m)} aria-pressed={mode === m}
                className={`press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-center text-sm font-medium outline-none transition-[background-color,border-color,box-shadow] duration-[var(--dur-base)] focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40 ${mode === m ? "border-brand bg-brand-soft text-brand ring-2 ring-brand-ring" : "border-line bg-surface shadow-rest hover:border-line-strong hover:bg-surface-2"}`}>
                <Icon aria-hidden className="size-6" />{label}
              </button>
            ))}
          </div>
          {giftApplied > 0 && <p className="text-xs text-muted" role="status" aria-live="polite">{payBase > 0 ? `Hediye kartı ${TL(giftApplied)} karşıladı; kalan ${TL(payBase)} tutar seçilen yöntemle alınır.` : `Hediye kartı ${TL(giftApplied)} ile tutarın tamamı karşılandı; ek ödeme yok.`}</p>}
          <label className="flex items-center gap-3"><span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Alınan nakit ({currencyUnit(currency)})</span><input name="amount-nakit" inputMode="decimal" maxLength={12} value={cash} onChange={(e) => { setCash(e.target.value); setError(null); }} onKeyDown={submitFromAmount} placeholder="0,00" aria-invalid={cashInvalid || undefined} aria-describedby={cashInvalid ? amountErrorId : undefined} className={`${amount} min-w-0 ${cashInvalid ? "border-bad focus:border-bad focus:ring-bad/50" : ""}`} /></label>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={tipInputId} className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Bahşiş ({currencyUnit(currency)})</label>
            <input id={tipInputId} name="amount-bahsis" inputMode="decimal" maxLength={12} value={tip} onChange={(e) => { setTip(e.target.value); setError(null); }} onKeyDown={submitFromAmount} placeholder="0,00" aria-invalid={tipInvalid || undefined} aria-describedby={tipInvalid ? amountErrorId : undefined} className={`${amount} min-w-0 flex-1 ${tipInvalid ? "border-bad focus:border-bad focus:ring-bad/50" : ""}`} />
            <div className="flex shrink-0 gap-1" role="group" aria-label="Bahşiş oranı">
              {[10, 15].map((p) => (
                <Button key={p} variant="secondary" size="sm" type="button" className="min-h-12" onClick={() => { setError(null); setTip(bare(Math.min(MAX_TIP_KURUS, Math.round((total * p) / 100)))); }}>{`%${p}`}</Button>
              ))}
              {tip && <IconButton label="Bahşişi kaldır" onClick={() => { setTip(""); setError(null); }}><X aria-hidden className="size-5" /></IconButton>}
            </div>
          </div>
          {due > 0 && (
            <div className="flex flex-wrap gap-2 pl-[7.75rem]" role="group" aria-label={`Nakit hızlı tutar seçenekleri (${currencyUnit(currency)})`}>
              <Button variant="secondary" size="sm" className="min-h-12" onClick={() => setCashK(due)}>Tam tutar</Button>
              {quickCash(due).map((k) => <Button key={k} variant="secondary" size="sm" className="min-h-12 tabular" onClick={() => setCashK(k)}>{bare(k).replace(",00", "")} {currencyUnit(currency)}</Button>)}
            </div>
          )}
          {card !== null && <label className="flex items-center gap-3"><span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Kart ({currencyUnit(currency)})</span><input ref={cardAmountRef} name="amount-kart" inputMode="decimal" maxLength={12} value={card} onChange={(e) => { setCard(e.target.value); setError(null); }} onKeyDown={submitFromAmount} aria-invalid={cardInvalid || undefined} aria-describedby={cardInvalid ? amountErrorId : undefined} className={`${amount} min-w-0 ${cardInvalid ? "border-bad focus:border-bad focus:ring-bad/50" : ""}`} /><IconButton label="Kartı kaldır" onClick={() => { setCard(null); setError(null); requestAnimationFrame(() => addCardRef.current?.focus()); }}><X aria-hidden className="size-5" /></IconButton></label>}
          {meal !== null && <label className="flex items-center gap-3"><span className="w-24 shrink-0 text-sm font-medium text-ink-2 sm:w-28">Yemek kartı ({currencyUnit(currency)})</span><input ref={mealAmountRef} name="amount-yemek_karti" inputMode="decimal" maxLength={12} value={meal} onChange={(e) => { setMeal(e.target.value); setError(null); }} onKeyDown={submitFromAmount} aria-invalid={mealInvalid || undefined} aria-describedby={mealInvalid ? amountErrorId : undefined} className={`${amount} min-w-0 ${mealInvalid ? "border-bad focus:border-bad focus:ring-bad/50" : ""}`} /><IconButton label="Yemek kartını kaldır" onClick={() => { setMeal(null); setError(null); requestAnimationFrame(() => addMealRef.current?.focus()); }}><X aria-hidden className="size-5" /></IconButton></label>}
          <div className="flex flex-wrap gap-2 pt-1">
            {card === null && <Button ref={addCardRef} variant="ghost" size="sm" className="min-h-12" onClick={() => { setCard(""); setError(null); requestAnimationFrame(() => cardAmountRef.current?.focus()); }}><Plus aria-hidden className="size-4" />Kart ekle</Button>}
            {meal === null && <Button ref={addMealRef} variant="ghost" size="sm" className="min-h-12" onClick={() => { setMeal(""); setError(null); requestAnimationFrame(() => mealAmountRef.current?.focus()); }}><Plus aria-hidden className="size-4" />Yemek kartı ekle</Button>}
            {!invoicing && <Button ref={invoiceToggleRef} variant="ghost" size="sm" className="min-h-12" onClick={() => { setInvoiceNotice(""); setInvoicing(true); }}><FileText aria-hidden className="size-4" />Fatura</Button>}
            {buyer && !invoicing && <span className="inline-flex max-w-full break-words rounded-full bg-brand-soft px-2.5 text-sm text-brand" data-testid="buyer-badge">{buyer.name}</span>}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-surface-2/60 p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-2">Müşteri ve avantajlar</p>
              <p className="truncate text-xs text-muted" title={extrasSummary}>{extrasSummary}</p>
            </div>
            <Button variant="ghost" size="sm" type="button" disabled={loyaltyBusy !== null} className="min-h-12 disabled:cursor-wait disabled:opacity-50" onClick={() => setExtrasOpen((open) => !open)} aria-expanded={extrasOpen} aria-controls={extrasPanelId}>
              {extrasOpen ? "Gizle" : "Aç"}<ChevronDown aria-hidden className={`size-4 transition-transform ${extrasOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          <div id={extrasPanelId} hidden={!extrasOpen} className="mt-3">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-1">
            <label htmlFor={customerPhoneInputId} className="col-span-2 text-xs font-medium text-muted">Müşteri telefonu</label>
            <input id={customerPhoneInputId} type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={phone} disabled={loyaltyBusy !== null} onChange={(e) => {
              const next = e.target.value;
              if (next !== phone) {
                const hadCustomerBenefit = Boolean(cust || coupon);
                setCust(null);
                setRedeem("");
                setCoupon(null);
                setLoyaltyNoticeTone("warn");
                if (hadCustomerBenefit) setLoyaltyMsg("Müşteri telefonu değişti; müşteri ve kupon avantajlarını yeniden doğrula.");
                else if (!loyaltyMsg?.includes("değişti")) setLoyaltyMsg(null);
              }
              setPhone(next);
            }} placeholder="05xx xxx xx xx" className="min-h-12 min-w-0 w-full rounded-lg border border-line bg-surface px-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring/50 disabled:cursor-wait disabled:opacity-50 lg:text-sm" />
            <Button variant="secondary" size="sm" type="button" className="min-h-12" disabled={loyaltyBusy !== null || !phone.trim()} aria-busy={loyaltyBusy === "customer" || undefined} onClick={(e) => void lookupCustomer(e.currentTarget)}>{loyaltyBusy === "customer" ? "Aranıyor…" : "Müşteri bul"}</Button>
          </div>
          {cust && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 break-words font-medium">{cust.name}</span>
              <Badge tone="brand">{cust.points} puan</Badge>
              {cust.enabled && cust.points >= cust.minRedeemPoints && (
                <label className="flex items-center gap-1.5 text-ink-2">
                  Kullan
                  <input value={redeem} onChange={(e) => setRedeem(e.target.value)} inputMode="numeric" maxLength={10} placeholder="0" aria-label="Harcanacak puan" aria-invalid={!!redeemError || undefined} aria-describedby={redeemError ? "redeem-points-error" : undefined} className={`tabular min-h-12 w-28 rounded-lg border bg-surface px-2 text-right text-base outline-none focus:border-brand lg:text-sm ${redeemError ? "border-bad focus:ring-4 focus:ring-bad/30" : "border-line focus:ring-2 focus:ring-brand-ring/50"}`} />
                  puan
                </label>
              )}
            </div>
          )}
          {redeemError && <p id="redeem-points-error" className="mt-1 text-xs text-warn" role="status" aria-live="polite">{redeemError} Bu değerle puan indirimi uygulanmayacak.</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1">
              <label htmlFor={couponInputId} className="text-xs font-medium text-muted">Kupon kodu</label>
              <div className="flex min-w-0 items-center gap-2">
              <input id={couponInputId} maxLength={48} value={couponCode} disabled={loyaltyBusy !== null} onChange={(e) => {
                const next = e.target.value;
                if (coupon && next.trim().toUpperCase() !== coupon.code) {
                  setCoupon(null); setLoyaltyNoticeTone("warn"); setLoyaltyMsg("Kupon kodu değişti; yeniden uygula.");
                } else if (loyaltyMsg && !loyaltyMsg.includes("değişti")) setLoyaltyMsg(null);
                setCouponCode(next);
              }} placeholder="Kodu girin" aria-describedby={`${couponInputId}-hint`} className="min-h-12 min-w-0 w-full rounded-lg border border-line bg-surface px-2.5 text-base uppercase outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring/50 disabled:cursor-wait disabled:opacity-50 lg:text-sm" />
              <Button variant="secondary" size="sm" type="button" className="min-h-12" disabled={loyaltyBusy !== null || !couponCode.trim()} aria-busy={loyaltyBusy === "coupon" || undefined} onClick={(e) => void applyCoupon(e.currentTarget)}>{loyaltyBusy === "coupon" ? "Uygulanıyor…" : "Uygula"}</Button>
              </div>
              <span id={`${couponInputId}-hint`} className="text-xs text-muted">3–24 harf/rakam; boşluk ve tire yok sayılır.</span>
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor={giftInputId} className="text-xs font-medium text-muted">Hediye kartı kodu</label>
              <div className="flex min-w-0 items-center gap-2">
              <input id={giftInputId} maxLength={48} value={giftCode} disabled={loyaltyBusy !== null} onChange={(e) => {
                const next = e.target.value;
                if (gift && next.trim().toUpperCase() !== gift.code) {
                  setGift(null); setLoyaltyNoticeTone("warn"); setLoyaltyMsg("Hediye kartı kodu değişti; yeniden kontrol et.");
                } else if (loyaltyMsg && !loyaltyMsg.includes("değişti")) setLoyaltyMsg(null);
                setGiftCode(next);
              }} placeholder="Kart kodunu girin" aria-describedby={`${giftInputId}-hint`} className="min-h-12 min-w-0 w-full rounded-lg border border-line bg-surface px-2.5 text-base uppercase outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring/50 disabled:cursor-wait disabled:opacity-50 lg:text-sm" />
              <Button variant="secondary" size="sm" type="button" className="min-h-12" disabled={loyaltyBusy !== null || !giftCode.trim()} aria-busy={loyaltyBusy === "gift" || undefined} onClick={(e) => void applyGift(e.currentTarget)}>{loyaltyBusy === "gift" ? "Kontrol ediliyor…" : "Kontrol et"}</Button>
              </div>
              <span id={`${giftInputId}-hint`} className="text-xs text-muted">3–24 harf/rakam; boşluk ve tire yok sayılır.</span>
            </div>
          </div>
          {(discount > 0 || giftApplied > 0) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ok">
              {discount > 0 && <span>İndirim: −{TL(discount)}</span>}
              {giftApplied > 0 && <span>Hediye kartı: −{TL(giftApplied)}</span>}
            </div>
          )}
          {loyaltyMsg && <p ref={loyaltyNoticeRef} tabIndex={-1} className={`mt-2 break-words text-xs outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/40 ${loyaltyNoticeTone === "ok" ? "text-ok" : "text-warn"}`} role="status" aria-live="polite">{loyaltyMsg}</p>}
          {loyaltyBusy && <p className="sr-only" role="status" aria-live="polite">{loyaltyBusy === "customer" ? "Müşteri aranıyor." : loyaltyBusy === "coupon" ? "Kupon doğrulanıyor." : "Hediye kartı doğrulanıyor."}</p>}
          </div>
        </div>
      </fieldset>
      {invoicing && <InvoiceForm initial={buyer} disabled={pending} onSave={(b) => closeInvoice(b, "Fatura bilgisi kaydedildi.")} onCancel={() => closeInvoice(null, "Faturasız satış seçildi.")} />}
      {invoiceNotice && <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{invoiceNotice}</p>}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{settlementNotice}</p>
      <div className="mt-5">
        {invalidAmount && <p id={amountErrorId} className="mb-2 break-words rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn" role="alert" aria-live="assertive">{settlementAnnouncement}</p>}
        {s.ok ? (
          <div className="flex items-baseline justify-between rounded-xl bg-ok-soft px-4 py-3 text-ok"><span className="font-medium">Para üstü</span>{" "}<span className="tabular text-2xl font-bold">{TL(s.change)}</span></div>
        ) : payments.length > 0 ? (
          <div className="rounded-xl bg-warn-soft px-4 py-3 text-warn">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Kalan tutar</span>
              <span className="tabular text-xl font-bold">{TL(remaining)}</span>
            </div>
            <p className="mt-1 text-xs">{settlementError}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-3 px-4 py-3 text-sm text-muted">Ödeme yöntemini seçin ya da alınan tutarı girin.</div>
        )}
      </div>
      {error && <p className="mt-3 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
      {pending && <p className="sr-only" role="status" aria-live="polite">Satış kaydediliyor, lütfen bekleyin.</p>}
    </Dialog>
  );
}

function WeighDialog({ product, onOk, onClose, scale, currency }: { product: KasaProduct; onOk: (grams: number) => string | null; onClose: () => void; scale?: ReadScale; currency?: Currency }) {
  const { TL } = kasaFmt({ device: { currency } });
  const [v, setV] = useState("");
  const [scaleMsg, setScaleMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const weightRef = useRef<HTMLInputElement>(null);
  const g = parseKg(v);
  const weightInvalid = v.trim() !== "" && g === null;
  useEffect(() => {
    const frame = requestAnimationFrame(() => weightRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const fromScale = async () => {
    setReading(true);
    setScaleMsg(null);
    setSubmitError(null);
    try {
      const r = await scale!();
      if (!r.stable) setScaleMsg("Tartı dengelenmedi, tekrar deneyin.");
      else if (!Number.isSafeInteger(r.grams) || r.grams <= 0) setScaleMsg("Teraziden geçerli bir ağırlık okunamadı; ürünü kontrol edip yeniden deneyin.");
      else if (r.grams > 1_000_000) setScaleMsg("Terazi ölçümü 1000 kg sınırını aşıyor. Ölçümü kontrol edin veya ağırlığı elle girin.");
      else setV((r.grams / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
    } catch (e) {
      setScaleMsg(e instanceof Error ? e.message : "Terazi okunamadı.");
    }
    setReading(false);
  };
  return (
    <Dialog label="Tartım" title={product.name} aside={<span className="tabular text-sm text-muted">{TL(product.price)}/kg</span>} onClose={onClose} closeDisabled={reading} size="sm"
      footer={<>
        <Button variant="secondary" size="lg" disabled={reading} onClick={onClose} className="flex-1">Vazgeç</Button>
        <Button type="submit" form="weigh-form" size="lg" disabled={!g || reading} className="flex-[2]">{reading ? "Tartı okunuyor…" : "Sepete ekle"}</Button>
      </>}>
      <form id="weigh-form" aria-busy={reading} onSubmit={(e) => { e.preventDefault(); if (g && !reading) { const message = onOk(g); setSubmitError(message); if (!message) onClose(); } }}>
        <label className="block text-sm font-medium text-ink-2" htmlFor="weigh-kg">Ağırlık (kg)</label>
        <input ref={weightRef} id="weigh-kg" name="kg" inputMode="decimal" maxLength={8} value={v} disabled={reading} onChange={(e) => { setV(e.target.value); setScaleMsg(null); setSubmitError(null); }} placeholder="ör. 0,750" aria-invalid={weightInvalid || Boolean(submitError) || undefined} aria-describedby={weightInvalid ? "weigh-error weigh-hint" : submitError ? "weigh-submit-error weigh-hint" : "weigh-hint"} className={`tabular mt-1.5 h-16 w-full rounded-xl border px-4 text-right text-3xl font-semibold outline-none focus:ring-4 disabled:opacity-60 ${weightInvalid || submitError ? "border-bad focus:border-bad focus:ring-bad/40" : "border-line focus:border-brand focus:ring-brand-ring/50"}`} />
        <p id="weigh-hint" className="mt-1 text-xs text-muted">Kg olarak girin; ör. 0,750. 0’dan büyük, en fazla 1000 kg ve 3 ondalık hane.</p>
        {weightInvalid && <p id="weigh-error" className="mt-1 text-sm text-bad" role="status" aria-live="polite">0&apos;dan büyük ve en fazla 1000 kg olan geçerli bir ağırlık girin.</p>}
        {submitError && <p id="weigh-submit-error" className="mt-1 text-sm text-bad" role="alert" aria-live="assertive">{submitError}</p>}
        {scale && (
          <div className="mt-3 flex items-center gap-3">
            <Button variant="secondary" onClick={() => void fromScale()} disabled={reading} className="min-h-12"><Scale aria-hidden className="size-4" />{reading ? "Okunuyor…" : "Teraziden al"}</Button>
            {scaleMsg && <span className="break-words text-sm text-bad" role="alert" aria-live="assertive">{scaleMsg}</span>}
          </div>
        )}
        <div className="mt-4 min-h-10 text-right"><span className="block text-xs text-muted">Satır tutarı</span><output aria-label="Satır tutarı" aria-live="polite" aria-atomic="true" className="tabular block text-2xl font-bold">{g ? TL(Math.round((product.price * g) / 1000)) : "—"}</output></div>
      </form>
    </Dialog>
  );
}

const MAX_SHOWN = 60;
const kg = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export function SaleScreen({ categories, products, priceLists = [], market, onPay, onReceipt, prints = {}, onRetryPrint, scale, onRemove, currency, autoFocusSearch = true }: { categories: { id: string; name: string }[]; products: KasaProduct[]; priceLists?: PriceListCore[]; market: boolean; onPay: OnSale; onReceipt: (saleId: string) => void; prints?: Record<string, PrintView>; onRetryPrint?: (saleId: string) => void; scale?: ReadScale; onRemove?: (type: "line_removed" | "cart_cleared", lines: RemovedLine[]) => void; currency?: Currency; autoFocusSearch?: boolean }) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt({ device: { currency } });
  const searchHintId = useId();
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef(cart);
  const [undoCart, setUndoCart] = useState<CartLine[] | null>(null);
  const [cartNotice, setCartNotice] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const categoryRail = useRef<HTMLDivElement>(null);
  const [hasMoreCategories, setHasMoreCategories] = useState(false);
  const [scrollableCategories, setScrollableCategories] = useState(false);
  const cartTotal = useRef<HTMLDivElement>(null);
  const [cartTotalVisible, setCartTotalVisible] = useState(false);
  const [q, setQ] = useState("");
  const [resultNotice, setResultNotice] = useState<{ key: string; text: string } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [weigh, setWeigh] = useState<KasaProduct | null>(null);
  const [paying, setPaying] = useState(false);
  const [last, setLast] = useState<{ saleId: string; receiptNo: string; change: number } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const t = totals(cart);
  useEffect(() => {
    const rail = categoryRail.current;
    if (!rail) return;
    const update = () => {
      setScrollableCategories(rail.scrollWidth > rail.clientWidth + 1);
      setHasMoreCategories(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1);
    };
    update();
    rail.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    for (const child of rail.children) observer.observe(child);
    return () => {
      rail.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [categories.length, market]);
  useEffect(() => {
    const target = cartTotal.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setCartTotalVisible(entry.isIntersecting && entry.intersectionRatio >= 0.5), { threshold: [0, 0.5] });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  // M9a: silme/azaltma kaydı. Güncelleyici fonksiyon değil düz değer: StrictMode'da iki kez çağrılıp çift olay yazmasın.
  const shrink = (productId: string, qtyMilli: number) => {
    const current = cartRef.current;
    const next = setQty(current, productId, qtyMilli);
    const out = removedLines(current, next);
    setUndoCart(null);
    cartRef.current = next;
    setCart(next);
    if (out[0]) {
      const remainingLine = next.find((line) => line.productId === out[0].productId);
      setCartNotice(remainingLine
        ? `${out[0].name} adedi ${(remainingLine.qtyMilli / 1000).toLocaleString("tr-TR")} oldu.`
        : `${out[0].name} sepetten çıkarıldı.`);
      if (!remainingLine) requestAnimationFrame(() => {
        const nextCartAction = document.querySelector<HTMLButtonElement>('[data-testid="cart-line"] button');
        (nextCartAction ?? search.current)?.focus();
      });
    }
    if (out.length) onRemove?.("line_removed", out);
  };
  const clear = () => {
    const current = cartRef.current;
    if (current.length) onRemove?.("cart_cleared", removedLines(current, []));
    setUndoCart(current.length ? current : null);
    setCartNotice(current.length ? "Sepet temizlendi. Geri almak için sepet alanındaki Geri al düğmesini kullanın." : "");
    cartRef.current = [];
    setCart([]);
    if (current.length) requestAnimationFrame(() => undoRef.current?.focus());
  };
  const index = useMemo(() => buildIndex(products), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const shown = useMemo(() => {
    const needle = normalizeSearchText(q.trim());
    // Markette ızgara yalnız hızlı tuşlar (binlerce ürün); arama her zaman tüm katalogda.
    const base = needle ? products.filter((p) => normalizeSearchText(p.name).includes(needle) || p.barcodes.includes(q.trim())) : market ? products.filter((p) => p.quick) : products;
    const matches = base.filter((p) => (cat ? p.categoryId === cat : true));
    return { items: matches.slice(0, MAX_SHOWN), hasMore: matches.length > MAX_SHOWN };
  }, [products, cat, q, market]);
  const resultKey = `${q.trim()}|${cat ?? ""}|${shown.items.length}|${shown.hasMore}|${products.length}|${market}`;
  const emptyResultText = q.trim()
    ? `“${q.trim().slice(0, 32)}” aramasıyla eşleşen ürün yok.`
    : cat
      ? "Bu kategoride satışa açık ürün yok."
      : market && products.length > 0
        ? "Hızlı tuş yok. Barkod okutun ya da arayın."
        : "Satışa açık ürün yok.";
  const resultSummary = useMemo(() => {
    if (shown.items.length === 0) return emptyResultText;
    const queryLabel = q.trim() ? `“${q.trim().slice(0, 32)}” araması: ` : "";
    return `${queryLabel}${shown.items.length}${shown.hasMore ? "+" : ""} ürün gösteriliyor${shown.hasMore ? " · aramayı daraltın" : ""}`;
  }, [emptyResultText, q, shown.hasMore, shown.items.length]);
  useEffect(() => {
    const timer = window.setTimeout(() => setResultNotice({ key: resultKey, text: resultSummary }), 450);
    return () => window.clearTimeout(timer);
  }, [resultKey, resultSummary]);
  const resultText = resultNotice === null
    ? resultSummary
    : resultNotice.key === resultKey ? resultNotice.text : "";
  // #50: fiyat satır eklenirken donar — happy hour bitse de sepetteki satır değişmez.
  const add = (p: KasaProduct, qtyMilli = 1000): string | null => {
    const current = cartRef.current;
    const nextQty = (current.find((line) => line.productId === p.id)?.qtyMilli ?? 0) + qtyMilli;
    if (nextQty > MAX_CART_LINE_QTY_MILLI) {
      const message = `${p.name}: bir satış satırında en fazla ${p.kind === "tartili" ? "1.000 kg" : "1.000 adet"} olabilir.`;
      setScanError(message);
      return message;
    }
    setUndoCart(null);
    const next = addProduct(current, { ...p, price: effectivePrice(p.id, p.price, priceLists, new Date(), undefined, p.categoryId) }, qtyMilli);
    cartRef.current = next;
    setCart(next);
    setCartNotice(`${p.name} sepete eklendi${p.kind === "tartili" ? `, toplam ${kg(nextQty)}` : `, ${nextQty / 1000} adet`}.`);
    setLast(null);
    setScanError(null);
    return null;
  };
  const pick = (p: KasaProduct) => (p.kind === "tartili" ? setWeigh(p) : add(p));
  const refocus = () => requestAnimationFrame(() => search.current?.focus());
  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !q.trim()) return;
    const r = resolveScan(q, index);
    if ("product" in r) { if (add(r.product, r.qtyMilli) === null) setQ(""); return; }
    if ("weigh" in r) { setWeigh(r.weigh); setQ(""); return; }
    // Barkod değilse ve aramada tek ürün kaldıysa onu ekle (elle arama + Enter).
    if (shown.items.length === 1 && !/^\d+\*/.test(q.trim())) {
      const product = shown.items[0];
      if (product.kind === "tartili") { setWeigh(product); setQ(""); }
      else if (add(product) === null) setQ("");
      return;
    }
    if (shown.items.length > 1 && !/^\d+\*/.test(q.trim())) {
      setScanError("Birden fazla ürün bulundu. Listeden doğru ürünü seçin.");
      return;
    }
    // Metin aramasında eşleşme yoksa sorguyu koru; kullanıcı düzenleyebilsin.
    if (shown.items.length === 0 && /[\p{L}\s]/u.test(q.trim())) return;
    setScanError(r.error);
  };

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      // Keep the modal's focus trap intact while weighing or taking payment.
      if (paying || weigh) return;
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
  }, [q, paying, weigh]);

  const inCart = new Map(cart.map((l) => [l.productId, l.qtyMilli]));
  const count = cart.reduce((a, l) => a + (byId.get(l.productId)?.kind === "tartili" ? 1 : l.qtyMilli / 1000), 0);
  const chip = (on: boolean) => `press inline-flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand-action text-white shadow-card" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`;

  return (
    <div {...mainProps} className="grid min-h-0 min-w-0 flex-1 gap-4 p-4 outline-none lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Yeni satış</h1>
            <p className="text-xs text-muted">Ürünü seçin veya barkodu okutun.</p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex"><Kbd>F2</Kbd> ara · <Kbd>Enter</Kbd> barkod okut / tek sonucu ekle</span>
        </div>
        <div className="relative">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input ref={search} value={q} maxLength={80} onChange={(e) => { setQ(e.target.value); setScanError(null); }} onKeyDown={onScan} placeholder="Ürün adı ya da barkod" aria-label="Ürün ara ya da barkod okut" aria-describedby={searchHintId} autoFocus={autoFocusSearch}
            className={`h-14 w-full rounded-2xl border border-line bg-surface pl-12 ${q ? "pr-14" : "pr-4"} text-base shadow-card outline-none transition placeholder:text-muted hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50`} />
          {q && <button type="button" aria-label="Aramayı temizle" onClick={() => { setQ(""); setScanError(null); refocus(); }} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-muted outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60"><X aria-hidden className="size-4" /></button>}
        </div>
        <div className="mb-2 mt-1 flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <p className="break-words text-sm font-medium text-bad" role="alert" aria-live="assertive">{scanError}</p>
          {!scanError && <span role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted">{resultText}</span>}
          <span id={searchHintId} className="sr-only">F2 aramaya gider. Enter okutulan barkodu ya da tek arama sonucunu ekler. Miktar için 5* = 5 adet girin.</span>
          <span className="shrink-0 text-xs text-muted">Miktar: 5* = 5 adet</span>
        </div>
        <div className="relative -mx-1 mb-3">
          <div ref={categoryRail} role={scrollableCategories ? "region" : "group"} aria-label={scrollableCategories ? "Ürün kategorileri; yatay kaydırılabilir" : "Ürün kategorileri"} tabIndex={scrollableCategories ? 0 : undefined} className="flex gap-2 overflow-x-auto px-1 pb-1 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">
            <button type="button" aria-pressed={cat === null} onClick={() => { setCat(null); setScanError(null); }} className={chip(cat === null)}>{market && !q ? "Hızlı tuşlar" : "Tümü"}</button>
            {categories.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} title={c.name} onClick={() => { setCat(c.id); setScanError(null); }} className={chip(cat === c.id)}><span aria-hidden className={`size-2.5 rounded-full ${categoryTone(c.id).dot}`} />{c.name}</button>)}
          </div>
          {hasMoreCategories && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-canvas via-canvas/90 to-transparent pr-1 text-muted"><ChevronRight className="size-4" /></div>}
        </div>
        <div className="grid auto-rows-[7.5rem] grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.items.map((p) => {
            const n = inCart.get(p.id);
            const activePrice = effectivePrice(p.id, p.price, priceLists, new Date(), undefined, p.categoryId);
            return (
              <button key={p.id} type="button" onClick={() => { pick(p); refocus(); }}
                className={`press group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border bg-surface p-3.5 pt-4 text-left shadow-rest outline-none transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${n ? "border-brand ring-2 ring-brand-ring" : "border-line"}`}>
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${categoryTone(p.categoryId).stripe}`} />
                <span title={p.name} className="line-clamp-2 pr-7 font-display text-[15px] font-semibold leading-snug">{p.name}</span>
                <span className="mt-auto flex flex-col items-start pt-1">
                  <span className="tabular flex items-baseline gap-1 text-[15px] font-semibold text-ink-2">{activePrice !== p.price && <span className="sr-only">Şu an </span>}{TL(activePrice)}{p.kind === "tartili" && <span className="text-xs font-medium text-muted">/kg</span>}</span>
                  {activePrice !== p.price && <span className="tabular text-[10px] leading-4 text-muted">Ürün fiyatı {TL(p.price)}{p.kind === "tartili" ? "/kg" : ""}</span>}
                </span>
                {n !== undefined && <span className="sr-only">Sepette {p.kind === "tartili" ? kg(n) : `${n / 1000} adet`}</span>}
                {n !== undefined && <span aria-hidden className="tabular absolute right-2.5 top-3 grid min-w-7 place-items-center rounded-full bg-brand-action px-1.5 py-0.5 text-xs font-bold text-white shadow-rest">{p.kind === "tartili" ? <Scale className="size-3.5" /> : n / 1000}</span>}
              </button>
            );
          })}
          {shown.items.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center gap-2 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-3 text-line-strong"><ShoppingBasket aria-hidden className="size-6" /></span>
              <p className="text-sm text-muted">{emptyResultText}</p>
              {(q || cat !== null) && <button type="button" onClick={() => { setQ(""); setCat(null); setScanError(null); refocus(); }} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand underline underline-offset-4 outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">Aramayı ve kategoriyi temizle</button>}
            </div>
          )}
        </div>
      </section>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-raised lg:sticky lg:top-2">
        <div className="flex items-center justify-between border-b border-line bg-surface-2/50 px-4 py-3">
          <h2 className="font-semibold">Sepet{cart.length > 0 ? ` · ${count.toLocaleString("tr-TR")} kalem` : ""}</h2>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{cartNotice}</p>
        </div>
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {cart.length === 0 && (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-surface-3 text-line-strong"><ShoppingBasket aria-hidden className="size-7" /></span>
              <div>
                {undoCart ? <>
                  <p className="font-medium text-ink-2">Sepet temizlendi.</p>
                  <button ref={undoRef} type="button" onClick={() => { cartRef.current = undoCart; setCart(undoCart); setUndoCart(null); setCartNotice("Sepet geri alındı."); refocus(); }} className="mt-1 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand underline underline-offset-4 outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">Geri al</button>
                </> : <>
                  <p className="font-medium text-ink-2">Sepet boş</p>
                  <p className="mt-0.5 text-xs text-muted">Ürün seçin ya da barkod okutun.</p>
                </>}
              </div>
            </div>
          )}
          {cart.map((l) => {
            const weighed = byId.get(l.productId)?.kind === "tartili";
            const step = "press grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60";
            return (
              <div key={l.productId} className="flex flex-wrap items-center gap-2 px-4 py-2.5" data-testid="cart-line">
                <div className="min-w-0 basis-full flex-1 sm:basis-auto"><div className="break-words font-medium">{l.name}</div><div className="tabular text-xs text-muted">{weighed ? `${kg(l.qtyMilli)} × ${TL(l.unitPrice)}/kg` : TL(l.unitPrice)}</div></div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {weighed ? (
                      <button type="button" aria-label={`${l.name} sil`} onClick={() => shrink(l.productId, 0)} className={`${step} text-bad`}><Trash2 aria-hidden className="size-4" /></button>
                  ) : (
                    <>
                      <button type="button" aria-label={`${l.name} azalt`} onClick={() => shrink(l.productId, Math.max(0, (cartRef.current.find((line) => line.productId === l.productId)?.qtyMilli ?? 0) - 1000))} className={step}>−</button>
                      <span className="tabular w-8 text-center font-semibold" data-testid="cart-qty">{l.qtyMilli / 1000}</span>
                      <button type="button" aria-label={`${l.name} artır, en fazla 1.000 adet`} title={l.qtyMilli >= MAX_CART_LINE_QTY_MILLI ? "Satır üst sınırı: 1.000 adet" : undefined} disabled={l.qtyMilli >= MAX_CART_LINE_QTY_MILLI} onClick={() => { const qty = Math.min(MAX_CART_LINE_QTY_MILLI, (cartRef.current.find((line) => line.productId === l.productId)?.qtyMilli ?? l.qtyMilli) + 1000); const next = setQty(cartRef.current, l.productId, qty); cartRef.current = next; setUndoCart(null); setCart(next); setCartNotice(`${l.name} adedi ${ (qty / 1000).toLocaleString("tr-TR") } oldu.`); }} className={`${step} disabled:cursor-not-allowed disabled:opacity-40`}>+</button>
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
          <div ref={cartTotal} tabIndex={-1} role="group" aria-label="Sepet toplamı" data-testid="cart-total" className="tabular mt-1.5 flex items-baseline justify-between rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Toplam</span>
            <span className="font-display text-4xl font-extrabold tracking-tight">{TL(t.total)}</span>
          </div>
          {last && (
            <div className="mt-3 rounded-xl border border-ok/30 bg-ok-soft p-3 text-sm text-ok">
              <div className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span role="status" aria-live="polite" aria-atomic="true">
                    <span className="block font-medium">Satış tamamlandı</span>
                    <span className="block text-xs text-ok/80">Fiş {last.receiptNo} · Para üstü {TL(last.change)}</span>
                  </span>
                </span>
                <Button variant="secondary" size="sm" disabled={prints[last.saleId]?.state === "printing"} onClick={() => onReceipt(last.saleId)} className="min-h-12 shrink-0">
                  <Printer aria-hidden className="size-4" />{prints[last.saleId]?.state === "printing" ? "Yazdırılıyor…" : prints[last.saleId]?.state === "ok" ? "Tekrar yazdır" : "Fişi yazdır"}
                </Button>
              </div>
              {prints[last.saleId] && (
                <div className="mt-1.5 pl-7" data-testid="print-state" role="status" aria-live="polite">
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
              <SmsReceiptForm key={last.saleId} saleId={last.saleId} />
            </div>
          )}
          <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-2">
            <Button variant="secondary" size="xl" onClick={clear} disabled={!cart.length} className="min-w-0 !text-base !font-medium"><Trash2 aria-hidden className="size-5" />Temizle</Button>
            <Button size="xl" onClick={() => setPaying(true)} disabled={!cart.length} className="min-w-0 text-xl">Öde{cart.length > 0 && <span aria-hidden className="tabular ml-1 hidden font-bold opacity-90 sm:inline">· {TL(t.total)}</span>}<ArrowRight aria-hidden className="size-6" /></Button>
          </div>
        </div>
      </aside>
      {cart.length > 0 && !cartTotalVisible && <button type="button" onClick={() => {
        const total = cartTotal.current;
        total?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
        requestAnimationFrame(() => total?.focus({ preventScroll: true }));
      }} className="fixed inset-x-4 z-40 mx-auto flex min-h-14 max-w-md items-center justify-between gap-3 rounded-2xl bg-brand-action px-4 py-3 text-left font-semibold text-white shadow-raised outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 lg:hidden" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <span className="flex min-w-0 flex-col"><span>Sepete git</span><span className="text-xs font-medium opacity-90">{count.toLocaleString("tr-TR")} kalem</span></span>
        <span className="tabular shrink-0">{TL(t.total)} <ArrowRight aria-hidden className="ml-1 inline size-4" /></span>
      </button>}
      {weigh && <WeighDialog product={weigh} scale={scale} currency={currency} onClose={() => { setWeigh(null); refocus(); }} onOk={(g) => add(weigh, g)} />}
          {paying && <PayDialog total={t.total} currency={currency} onPay={(id, p, b, tip) => onPay(id, p, cart, b, tip)} onClose={() => { setPaying(false); refocus(); }} onDone={(r) => { setPaying(false); setUndoCart(null); cartRef.current = []; setCart([]); setLast(r); refocus(); }} />}
    </div>
  );
}
