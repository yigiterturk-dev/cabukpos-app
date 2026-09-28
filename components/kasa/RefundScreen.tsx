"use client";
// İade: fiş no → (yerel, yoksa bulut) satış → ürün/miktar seç → geri ödeme yöntemi → kasiyerse müdür PIN'i → iade fişi.
// Çevrimdışıyken yalnız bu cihazda kesilmiş fişler bulunur.
import { useState } from "react";
import { totals } from "@/lib/core/cart";
import { formatTL } from "@/lib/core/money";
import { SELECTABLE_METHODS, type PayMethod } from "@/lib/core/payment";
import type { RefLine } from "@/lib/core/refund";
import { findLocalSale, recordRefundLocal } from "@/lib/offline/db";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { normalizeReceiptNo } from "@/lib/sync/docs";
import type { LookedUpSale } from "@/lib/sync/lookup";
import { Button } from "@/components/ui";
import { PinPad, type Cashier } from "./PinPad";

const kgText = (g: number) => `${(g / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

export function RefundScreen({ meta, cashier, online, onMeta, onDone, onBack }: { meta: Meta; cashier: Cashier; online: boolean; onMeta: (m: Meta) => void; onDone: (s: LocalSale) => void; onBack: () => void }) {
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
  const total = totals(picked).total;
  const role = meta.catalog.staff.find((s) => s.id === cashier.id)?.role;

  const record = async (approvedBy: string) => {
    if (!sale) return;
    setBusy(true);
    const r = await recordRefundLocal(cashier, approvedBy, sale, picked, method, refundId);
    setBusy(false);
    if (r.ok) onDone(r.sale);
    else { setApproving(false); setError(r.error); }
  };

  if (approving) {
    return (
      <main className="mx-auto w-full max-w-sm px-4 py-8 text-center">
        <h1 className="text-xl font-semibold">Müdür onayı</h1>
        <p className="mb-6 text-sm text-muted">{formatTL(total)} iade · müdür PIN&apos;i girsin</p>
        <PinPad meta={meta} onMeta={onMeta} only={(s) => s.role === "mudur"} onOk={(m) => void record(m.id)} />
        <button type="button" onClick={() => setApproving(false)} className="mt-6 text-sm underline">Vazgeç</button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm underline">← Kasa</button>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">İade</h1>
      <form onSubmit={(e) => { e.preventDefault(); void find(); }} className="flex gap-2">
        <input value={no} onChange={(e) => setNo(e.target.value)} autoFocus placeholder="Fiş no (ör. K1-000042)" aria-label="İade fiş no" className="flex-1 rounded-xl border border-line px-4 py-3 uppercase" />
        <Button type="submit" disabled={busy || !no.trim()}>Fişi bul</Button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {sale && (
        <section className="mt-6">
          <p className="mb-2 text-sm text-muted">Fiş {sale.receiptNo} · {new Date(sale.at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" })}</p>
          <div className="divide-y divide-line rounded-2xl border border-line">
            {sale.lines.map((l) => {
              const q = qty[l.productId] ?? 0;
              const set = (v: number) => setQty((s) => ({ ...s, [l.productId]: Math.max(0, Math.min(l.qtyMilli, v)) }));
              return (
                <div key={l.productId} className="flex items-center gap-3 p-3" data-testid="refund-line">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.name}</div>
                    <div className="tabular text-xs text-muted">İade edilebilir: {weighed(l) ? kgText(l.qtyMilli) : l.qtyMilli / 1000} · {formatTL(l.unitPrice)}{weighed(l) && "/kg"}</div>
                  </div>
                  {weighed(l) ? (
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q > 0} onChange={(e) => set(e.target.checked ? l.qtyMilli : 0)} className="size-4 accent-[var(--color-brand)]" />Tamamı</label>
                  ) : (
                    <>
                      <button type="button" aria-label={`${l.name} iade azalt`} onClick={() => set(q - 1000)} className="size-8 rounded-lg border border-line">−</button>
                      <span className="tabular w-8 text-center">{q / 1000}</span>
                      <button type="button" aria-label={`${l.name} iade artır`} onClick={() => set(q + 1000)} className="size-8 rounded-lg border border-line">+</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Geri ödeme">
            <span className="text-sm">Geri ödeme:</span>
            {SELECTABLE_METHODS.map((m) => (
              <button key={m.value} type="button" aria-pressed={method === m.value} onClick={() => setMethod(m.value)} className={`rounded-lg border px-3 py-2 text-sm ${method === m.value ? "border-brand bg-brand-soft font-medium text-brand" : "border-line"}`}>{m.label}</button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <span data-testid="refund-total" className="tabular text-2xl font-bold">{formatTL(total)}</span>
            <Button disabled={!picked.length || busy} onClick={() => (role === "mudur" ? void record(cashier.id) : setApproving(true))}>İadeyi onayla</Button>
          </div>
        </section>
      )}
    </main>
  );
}
