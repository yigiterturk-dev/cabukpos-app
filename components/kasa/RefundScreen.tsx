"use client";
// İade: fiş no → (yerel, yoksa bulut) satış → ürün/miktar seç → geri ödeme yöntemi → kasiyerse müdür PIN'i → iade fişi.
// Çevrimdışıyken yalnız bu cihazda kesilmiş fişler bulunur.
import { useState } from "react";
import { totals } from "@/lib/core/cart";
import { kasaFmt } from "./kasa-format";
import { SELECTABLE_METHODS, type PayMethod } from "@/lib/core/payment";
import type { RefLine } from "@/lib/core/refund";
import { findLocalSale, recordRefundLocal } from "@/lib/offline/db";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { normalizeReceiptNo } from "@/lib/sync/docs";
import type { LookedUpSale } from "@/lib/sync/lookup";
import { isPartialRefund } from "@/lib/core/refundNote";
import { Button } from "@/components/ui";
import { PinPad, type Cashier } from "./PinPad";

const kgText = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export function RefundScreen({ meta, cashier, online, onMeta, onDone, onBack }: { meta: Meta; cashier: Cashier; online: boolean; onMeta: (m: Meta) => void; onDone: (s: LocalSale) => void; onBack: () => void }) {
  const { TL } = kasaFmt(meta);
  const [no, setNo] = useState("");
  const [sale, setSale] = useState<LookedUpSale | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PayMethod>("nakit");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refundId] = useState(() => crypto.randomUUID());
  const weighed = (l: RefLine) => meta.catalog.products.find((p) => p.id === l.productId)?.kind === "tartili" || l.qtyMilli % 1000 !== 0;

  const find = async () => {
    setError(null);
    const n = normalizeReceiptNo(no);
    if (!n) return setError("Fiş no biçimi: K1-000042 (ya da K1-42).");
    setBusy(true);
    try {
      let s = await findLocalSale(n);
      if (!s) {
        if (!online) return setError("Fiş bu kasada yok. İnternet gelince tekrar deneyin.");
        const r = await fetch(`/api/sync/sale?no=${encodeURIComponent(n)}`, { cache: "no-store" });
        if (r.status === 404) return setError("Fiş bulunamadı.");
        if (!r.ok) return setError("Fiş sorgulanamadı. Tekrar deneyin.");
        s = (await r.json()) as LookedUpSale;
      }
      if (s.fiscalPending && online) {
        const c = await fetch(`/api/sync/sale?no=${encodeURIComponent(n)}`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<LookedUpSale>) : null)).catch(() => null);
        if (c?.fiscal) s = { ...s, fiscal: { ...c.fiscal, refundedBefore: c.fiscal.refundedBefore || s.fiscal?.refundedBefore === true } };
      }
      if (!s.lines.length) return setError("Bu fişin tamamı zaten iade edilmiş.");
      setSale(s);
      setQty({});
    } catch {
      setError("Fiş sorgulanamadı. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const picked: RefLine[] = sale ? sale.lines.map((l) => ({ ...l, qtyMilli: qty[l.productId] ?? 0 })).filter((l) => l.qtyMilli > 0) : [];
  const goods = totals(picked).total;
  // #33: satış düzeyi indirim iadeye oransal yansır — müşteri ödediği net tutardan fazlasını geri almaz.
  const refundDiscount = sale && sale.goodsTotal > 0 ? Math.floor((goods * sale.discount) / sale.goodsTotal) : 0;
  const total = goods - refundDiscount;
  const role = meta.catalog.staff.find((s) => s.id === cashier.id)?.role;

  const record = async (approvedBy: string) => {
    if (!sale) return;
    setBusy(true);
    // Asıl satış e-Arşiv'liyse iade fişine tutanak / alıcı faturası notu (bulut aynı kuralla kaydını açar).
    const rf = sale.fiscal ? (({ refundedBefore, ...f }) => ({ ...f, partial: isPartialRefund(sale.lines, picked, refundedBefore), sellerTaxId: meta.catalog.fiscal?.sellerTaxId ?? null }))(sale.fiscal) : undefined;
    try {
      const r = await recordRefundLocal(cashier, approvedBy, sale, picked, method, refundId, rf, refundDiscount);
      if (r.ok) onDone(r.sale);
      else { setApproving(false); setError(r.error); }
    } catch {
      setApproving(false);
      setError("İade kaydedilemedi. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  if (approving) {
    return (
      <main className="mx-auto w-full max-w-sm px-4 py-8 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Müdür onayı</h1>
        <p className="mb-6 text-sm text-muted">{TL(total)} iade · müdür PIN&apos;i girsin</p>
        <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m) => void record(m.id)} />
      <Button variant="ghost" type="button" disabled={busy} onClick={() => setApproving(false)} className="mt-6 min-h-12 w-full">Vazgeç</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <button type="button" onClick={onBack} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 -ml-3 mb-4">← Kasa</button>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight">İade</h1>
      <form onSubmit={(e) => { e.preventDefault(); void find(); }} className="flex flex-wrap gap-2">
        <input value={no} onChange={(e) => setNo(e.target.value)} autoFocus placeholder="Fiş no (ör. K1-000042)" aria-label="İade fiş no" className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 uppercase outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
      <Button type="submit" disabled={busy || !no.trim()} className="min-h-12 shrink-0">{busy ? "Sorgulanıyor…" : "Fişi bul"}</Button>
      </form>
      {error && <p className="mt-3 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
      {sale && (
        <section className="mt-6">
          <div className="mb-3 rounded-xl border border-line bg-surface-2/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Fiş {sale.receiptNo}</span><span className="text-xs text-muted">{new Date(sale.at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" })}</span></div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"><span>İade edilebilir: <b className="tabular text-ink-2">{TL(totals(sale.lines).total)}</b></span><span>Kalemleri seçip iade tutarını oluşturun.</span></div>
          </div>
          <div className="divide-y divide-line rounded-2xl border border-line">
            {sale.lines.map((l) => {
              const q = qty[l.productId] ?? 0;
              const set = (v: number) => setQty((s) => ({ ...s, [l.productId]: Math.max(0, Math.min(l.qtyMilli, v)) }));
              return (
                <div key={l.productId} className="flex flex-wrap items-center gap-3 p-3" data-testid="refund-line">
                  <div className="min-w-0 basis-full flex-1 sm:basis-auto">
                    <div className="truncate font-medium" title={l.name}>{l.name}</div>
                    <div className="tabular text-xs text-muted">İade edilebilir: {weighed(l) ? kgText(l.qtyMilli) : l.qtyMilli / 1000} · {TL(l.unitPrice)}{weighed(l) && "/kg"}</div>
                  </div>
                  {weighed(l) ? (
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q > 0} onChange={(e) => set(e.target.checked ? l.qtyMilli : 0)} className="size-4 accent-[var(--color-brand)]" />Tamamı</label>
                  ) : (
                    <>
                      <button type="button" aria-label={`${l.name} iade azalt`} disabled={q <= 0} onClick={() => set(q - 1000)} className="press grid size-12 place-items-center rounded-xl border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">−</button>
                      <span className="tabular w-8 text-center">{q / 1000}</span>
                      <button type="button" aria-label={`${l.name} iade artır`} disabled={q >= l.qtyMilli} onClick={() => set(q + 1000)} className="press grid size-12 place-items-center rounded-xl border border-line bg-surface text-lg font-medium outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40">+</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Geri ödeme">
            <span className="text-sm">Geri ödeme:</span>
            {SELECTABLE_METHODS.map((m) => (
              <button key={m.value} type="button" aria-pressed={method === m.value} onClick={() => setMethod(m.value)} className={`press min-h-12 rounded-[10px] border px-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${method === m.value ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`}>{m.label}</button>
            ))}
          </div>
          {refundDiscount > 0 && <p className="mt-2 text-right text-sm text-muted">İndirim payı −{TL(refundDiscount)} · Brüt {TL(goods)}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-soft/30 px-4 py-3">
            <div><span className="block text-xs font-medium uppercase tracking-wide text-muted">İade tutarı</span><span data-testid="refund-total" className="tabular font-display text-3xl font-extrabold tracking-tight">{TL(total)}</span><span className="mt-0.5 block text-xs text-muted">Yöntem: {SELECTABLE_METHODS.find((m) => m.value === method)?.label}</span></div>
            <Button disabled={!picked.length || busy} onClick={() => (role === "mudur" ? void record(cashier.id) : setApproving(true))} className="min-h-12">İadeyi onayla{picked.length > 0 && <span className="tabular">· {TL(total)}</span>}</Button>
          </div>
          {!picked.length && <p className="mt-2 text-right text-xs text-muted">İade için en az bir kalem seçin.</p>}
        </section>
      )}
    </main>
  );
}
