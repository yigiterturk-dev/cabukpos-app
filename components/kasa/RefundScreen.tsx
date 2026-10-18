"use client";
// İade: fiş no → (yerel, yoksa bulut) satış → ürün/miktar seç → geri ödeme yöntemi → kasiyerse müdür PIN'i → iade fişi.
// Çevrimdışıyken yalnız bu cihazda kesilmiş fişler bulunur.
import { useEffect, useId, useRef, useState } from "react";
import { totals } from "@/lib/core/cart";
import { parseKg } from "@/lib/core/scan";
import { kasaFmt } from "./kasa-format";
import { SELECTABLE_METHODS, type PayMethod } from "@/lib/core/payment";
import type { RefLine } from "@/lib/core/refund";
import { findLocalSale, recordRefundLocal } from "@/lib/offline/db";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { normalizeReceiptNo } from "@/lib/sync/docs";
import type { LookedUpSale } from "@/lib/sync/lookup";
import { isPartialRefund } from "@/lib/core/refundNote";
import { optionsText } from "@/lib/core/options";
import { Button } from "@/components/ui";
import { PinPad, type Cashier } from "./PinPad";
import { useKasaMainProps } from "./KasaPreviewContext";

const kgText = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
const receiptLookupFailure = () => navigator.onLine
  ? "Fiş sorgulanamadı. Sunucuya ulaşılamadı; bağlantıyı kontrol edip tekrar deneyin."
  : "Fiş bu kasada yok. Çevrimdışı olduğunuz için başka kasada kesilen fişler aranamaz.";

export function RefundScreen({ meta, cashier, online, onMeta, onDone, onBack, autoFocusLookup = true }: { meta: Meta; cashier: Cashier; online: boolean; onMeta: (m: Meta) => void; onDone: (s: LocalSale) => void; onBack: () => void; autoFocusLookup?: boolean }) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt(meta);
  const refundActionId = useId();
  const [no, setNo] = useState("");
  const [sale, setSale] = useState<LookedUpSale | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [weighedDraft, setWeighedDraft] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PayMethod>("nakit");
  const [refundNotice, setRefundNotice] = useState("");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const lookupRef = useRef<HTMLInputElement>(null);
  const [refundId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!error || busy) return;
    const frame = window.requestAnimationFrame(() => {
      (sale ? document.getElementById(refundActionId) : lookupRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, error, refundActionId, sale]);
  const weighed = (l: RefLine) => meta.catalog.products.find((p) => p.id === l.productId)?.kind === "tartili" || l.qtyMilli % 1000 !== 0;

  const find = async () => {
    setError(null);
    setSale(null);
    setQty({});
    setWeighedDraft({});
    setRefundNotice("");
    const n = normalizeReceiptNo(no);
    if (!n) {
      setError("Fiş no biçimi: K1-000042 (ya da K1-42).");
      return;
    }
    setBusy(true);
    try {
      let s = await findLocalSale(n);
      if (!s) {
        if (!online) return setError("Fiş bu kasada yok. İnternet gelince tekrar deneyin.");
        const r = await fetch(`/api/sync/sale?no=${encodeURIComponent(n)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (r.status === 404) return setError("Fiş bulunamadı.");
        if (!r.ok) return setError(r.status === 401 || r.status === 403 ? "Kasa oturumu doğrulanamadı. Sayfayı yenileyip tekrar deneyin." : "Fiş sorgulanamadı. Biraz sonra tekrar deneyin.");
        s = (await r.json()) as LookedUpSale;
      }
      if (s.fiscalPending && online) {
        const c = await fetch(`/api/sync/sale?no=${encodeURIComponent(n)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? (r.json() as Promise<LookedUpSale>) : null)).catch(() => null);
        if (c?.fiscal) s = { ...s, fiscal: { ...c.fiscal, refundedBefore: c.fiscal.refundedBefore || s.fiscal?.refundedBefore === true } };
      }
      if (!s.lines.length) return setError("Bu fişin tamamı zaten iade edilmiş.");
      setSale(s);
      setQty({});
      setWeighedDraft({});
      setRefundNotice(`Fiş ${s.receiptNo} bulundu. ${s.lines.length} kalem; iade edilecek miktarları seçin.`);
    } catch {
      setError(receiptLookupFailure());
    } finally {
      setBusy(false);
    }
  };

  const picked: RefLine[] = sale ? sale.lines.map((l, i) => ({ ...l, qtyMilli: qty[i] ?? 0 })).filter((l) => l.qtyMilli > 0) : [];
  const invalidWeighedDraft = sale?.lines.some((l, i) => {
    if (!weighed(l) || !(weighedDraft[i] ?? "").trim()) return false;
    const grams = parseKg(weighedDraft[i]);
    return grams === null || grams > l.qtyMilli;
  }) ?? false;
  const goods = totals(picked).total;
  // #33: satış düzeyi indirim iadeye oransal yansır — müşteri ödediği net tutardan fazlasını geri almaz.
  const refundDiscount = sale && sale.goodsTotal > 0 ? Math.floor((goods * sale.discount) / sale.goodsTotal) : 0;
  const total = goods - refundDiscount;
  const role = meta.catalog.staff.find((s) => s.id === cashier.id)?.role;

  const record = async (approvedBy: string, approvalToken?: string) => {
    if (!sale || recordingRef.current) return;
    recordingRef.current = true;
    setBusy(true);
    // Asıl satış e-Arşiv'liyse iade fişine tutanak / alıcı faturası notu (bulut aynı kuralla kaydını açar).
    const rf = sale.fiscal ? (({ refundedBefore, ...f }) => ({ ...f, partial: isPartialRefund(sale.lines, picked, refundedBefore), sellerTaxId: meta.catalog.fiscal?.sellerTaxId ?? null }))(sale.fiscal) : undefined;
    try {
      const r = await recordRefundLocal(cashier, approvedBy, sale, picked, method, refundId, rf, refundDiscount, approvalToken);
      if (r.ok) onDone(r.sale);
      else { setApproving(false); setError(r.error); }
    } catch {
      setApproving(false);
      setError("İade kaydedilemedi. Tekrar deneyin.");
    } finally {
      recordingRef.current = false;
      setBusy(false);
    }
  };

  if (approving) {
    return (
      <div {...mainProps} className="mx-auto w-full max-w-sm px-4 py-8 text-center outline-none">
        <h1 className="font-display text-2xl font-bold tracking-tight">Müdür onayı</h1>
        <p className="mb-6 text-sm text-muted">{TL(total)} iade · müdür PIN&apos;i girsin</p>
        <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m, token) => record(m.id, token)} autoFocusFirst />
      <Button variant="ghost" type="button" disabled={busy} onClick={() => {
        setApproving(false);
        requestAnimationFrame(() => lookupRef.current?.focus());
      }} className="mt-6 min-h-12 w-full">Vazgeç</Button>
      </div>
    );
  }

  return (
    <div {...mainProps} className="mx-auto w-full max-w-2xl px-4 py-6 outline-none">
      <button type="button" disabled={busy} onClick={onBack} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50 -ml-3 mb-4">← Kasa</button>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight">İade</h1>
      <form onSubmit={(e) => { e.preventDefault(); void find(); }} className="flex flex-wrap gap-2">
        <label htmlFor="refund-receipt" className="basis-full text-sm font-medium text-ink-2">Fiş numarası</label>
        <input id="refund-receipt" ref={lookupRef} value={no} onChange={(e) => { setNo(e.target.value); setSale(null); setQty({}); setError(null); setRefundNotice(""); }} disabled={busy} autoFocus={autoFocusLookup} required maxLength={15} placeholder="Ör. K1-000042" aria-invalid={!sale && !!error || undefined} aria-describedby={!sale && error ? "refund-lookup-error" : undefined} className={`min-h-12 min-w-0 flex-1 rounded-xl border bg-surface px-4 py-3 uppercase outline-none transition-[border-color,box-shadow] focus:ring-4 disabled:opacity-60 ${!sale && !!error ? "border-bad focus:border-bad focus:ring-bad/40" : "border-line focus:border-brand focus:ring-brand-ring/50"}`} />
      <Button type="submit" disabled={busy || !no.trim()} className="min-h-12 shrink-0">{busy ? "Sorgulanıyor…" : "Fişi bul"}</Button>
      </form>
      {busy && <p className="sr-only" role="status" aria-live="polite">{sale ? "İade kaydediliyor, lütfen bekleyin." : "Fiş sorgulanıyor, lütfen bekleyin."}</p>}
      {error && <p id={!sale ? "refund-lookup-error" : undefined} className="mt-3 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
      {sale && (
        <section aria-label="İade ayrıntıları" aria-busy={busy || undefined} className="mt-6">
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{refundNotice}</p>
          <div className="mb-3 rounded-xl border border-line bg-surface-2/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Fiş {sale.receiptNo}</span><span className="text-xs text-muted">{new Date(sale.at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" })}</span></div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"><span>Ürün tutarı (satış indirimi öncesi): <b className="tabular text-ink-2">{TL(totals(sale.lines).total)}</b></span><span>Kalemleri seçip iade tutarını oluşturun.</span></div>
            {sale.discount > 0 && <p className="mt-1 text-xs text-muted">Geri ödeme, seçilen ürünlere düşen satış indirimi payı kadar azalır.</p>}
          </div>
          <div className="divide-y divide-line rounded-2xl border border-line">
            {sale.lines.map((l, index) => {
              const q = qty[index] ?? 0;
              const lineLabel = [l.name, l.options?.length ? optionsText(l.options) : null, l.note ? `Not: ${l.note}` : null].filter(Boolean).join(", ");
              const weightDraft = weighedDraft[index] ?? "";
              const weightGrams = parseKg(weightDraft);
              const weightInvalid = weighed(l) && weightDraft.trim() !== "" && (weightGrams === null || weightGrams > l.qtyMilli);
              const set = (v: number, focusFallback?: string) => {
                const next = Math.max(0, Math.min(l.qtyMilli, v));
                setQty((s) => ({ ...s, [index]: next }));
                setError(null);
                setRefundNotice(`${lineLabel} iade miktarı ${weighed(l) ? kgText(next) : next / 1000}.`);
                if (focusFallback) window.requestAnimationFrame(() => document.getElementById(focusFallback)?.focus());
              };
              return (
                <div key={`${index}-${l.productId}`} className="flex flex-wrap items-center gap-3 p-3" data-testid="refund-line">
                  <div className="min-w-0 basis-full flex-1 sm:basis-auto">
                    <div className="break-words font-medium">{l.name}</div>
                    {l.options && l.options.length > 0 && <div className="break-words text-xs text-muted">{optionsText(l.options)}</div>}
                    {l.note && <div className="break-words text-xs text-warn">Not: {l.note}</div>}
                    <div className="tabular text-xs text-muted">İade edilebilir: {weighed(l) ? kgText(l.qtyMilli) : l.qtyMilli / 1000} · {TL(l.unitPrice)}{weighed(l) && "/kg"}</div>
                  </div>
                  {weighed(l) ? (
                    <div className="min-w-0 basis-full sm:basis-auto">
                      <label className="sr-only" htmlFor={`refund-kg-${index}`}>{lineLabel} iade ağırlığı (kg)</label>
                      <div className="flex items-center gap-2">
                        <input id={`refund-kg-${index}`} inputMode="decimal" maxLength={8} placeholder="0,000" value={weightDraft || (q ? (q / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "")} disabled={busy} aria-invalid={weightInvalid || undefined} aria-describedby={weightInvalid ? `refund-kg-hint-${index} refund-kg-error-${index}` : `refund-kg-hint-${index}`} onChange={(e) => {
                          const value = e.target.value;
                          setWeighedDraft((s) => ({ ...s, [index]: value }));
                          setError(null);
                          const grams = value.trim() ? parseKg(value) : 0;
                          if (grams !== null && grams <= l.qtyMilli) set(grams);
                        }} className={`tabular min-h-12 w-28 rounded-lg border bg-surface px-3 text-right outline-none focus:ring-4 disabled:opacity-60 ${weightInvalid ? "border-bad focus:border-bad focus:ring-bad/40" : "border-line focus:border-brand focus:ring-brand-ring/50"}`} />
                        <span className="text-sm">kg</span>
                      </div>
                      <span id={`refund-kg-hint-${index}`} className="mt-1 block text-xs text-muted">En fazla {kgText(l.qtyMilli)} iade edilebilir.</span>
                      {weightInvalid && <span id={`refund-kg-error-${index}`} className="mt-1 block text-xs text-bad" role="status" aria-live="polite">{weightGrams === null ? "0'dan büyük, en fazla üç ondalıklı kg girin. Örnek: 0,250." : `En fazla ${kgText(l.qtyMilli)} girebilirsiniz.`}</span>}
                    </div>
                  ) : (
                    <>
                      <button id={`refund-minus-${index}`} type="button" aria-label={`${lineLabel} iade azalt`} disabled={busy || q <= 0} onClick={(event) => set(q - 1000, event.detail === 0 && q === 1000 ? `refund-plus-${index}` : undefined)} className="press grid size-12 place-items-center rounded-xl border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">−</button>
                      <span className="tabular w-8 text-center">{q / 1000}</span>
                      <button id={`refund-plus-${index}`} type="button" aria-label={`${lineLabel} iade artır`} disabled={busy || q >= l.qtyMilli} onClick={(event) => set(q + 1000, event.detail === 0 && q + 1000 >= l.qtyMilli ? `refund-minus-${index}` : undefined)} className="press grid size-12 place-items-center rounded-xl border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">+</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <fieldset disabled={busy} className="mt-4 m-0 flex flex-wrap items-center gap-2 border-0 p-0">
            <legend className="text-sm">Geri ödeme:</legend>
            {SELECTABLE_METHODS.map((m) => (
              <label key={m.value} className={`press inline-flex min-h-12 cursor-pointer items-center rounded-[10px] border px-3 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${method === m.value ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>
                <input type="radio" name="refundMethod" value={m.value} required checked={method === m.value} onChange={() => { setMethod(m.value); setError(null); }} className="peer sr-only" />
                {m.label}
              </label>
            ))}
          </fieldset>
          {refundDiscount > 0 && <p className="mt-2 text-right text-sm text-muted">İndirim payı −{TL(refundDiscount)} · Brüt {TL(goods)}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-soft/30 px-4 py-3">
            <div><span className="block text-xs font-medium uppercase tracking-wide text-muted">İade tutarı</span><span data-testid="refund-total" aria-live="polite" aria-atomic="true" className="tabular font-display text-3xl font-extrabold tracking-tight">{TL(total)}</span><span className="mt-0.5 block text-xs text-muted">Yöntem: {SELECTABLE_METHODS.find((m) => m.value === method)?.label}</span></div>
            <Button id={refundActionId} disabled={!picked.length || invalidWeighedDraft || busy} aria-busy={busy || undefined} onClick={() => (role === "mudur" ? void record(cashier.id) : setApproving(true))} className="min-h-12">{busy ? "İade kaydediliyor…" : <>İadeyi onayla{picked.length > 0 && <span className="tabular">· {TL(total)}</span>}</>}</Button>
          </div>
          {!picked.length && <p className="mt-2 text-right text-xs text-muted">İade için en az bir kalem seçin.</p>}
        </section>
      )}
    </div>
  );
}
