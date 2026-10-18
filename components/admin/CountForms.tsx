"use client";
// #51 sayım oturumu formları.
import { setCountedLine, closeStockCount, cancelStockCount, startStockCount, type CountState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";

export function StartCountForm({ disabled }: { disabled?: boolean }) {
  const { state, pending, onSubmit } = useFormAction(startStockCount, {} as CountState);
  return <form onSubmit={onSubmit} aria-busy={pending}>
    <Button type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>{pending ? "Sayım başlatılıyor…" : "Sayım başlat"}</Button>
    {pending && <span className="sr-only" role="status" aria-live="polite">Yeni stok sayımı başlatılıyor.</span>}
    {state.error && <p className="mt-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
  </form>;
}

export function CountLineForm({ countId, lineId, productName, unit, countedMilli }: { countId: string; lineId: string; productName: string; unit: string; countedMilli: number | null }) {
  const { state, pending, onSubmit } = useFormAction(setCountedLine.bind(null, countId, lineId), {} as CountState);
  const qtyErrorId = useId();
  const qtyRef = useRef<HTMLInputElement>(null);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (state.field !== "qty" || !state.error) return;
    requestAnimationFrame(() => qtyRef.current?.focus());
  }, [state.error, state.field]);
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => qtyRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, state.savedAt]);
  const countedValue = countedMilli === null ? "" : unit === "adet" ? String(countedMilli / 1000) : (countedMilli / 1000).toFixed(3);
  const qtyHint = unit === "adet" ? "0 dahil · tam sayı · en fazla 999.999" : `0 dahil · en fazla 999.999,999 ${unit} · en çok 3 ondalık`;
  const showQtyError = state.field === "qty" && !!state.error && !edited && !pending;
  return (
    <form onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="flex flex-wrap items-end gap-2">
      <div className="w-32"><Field label="Sayılan" hint={qtyHint}><Input ref={qtyRef} name="qty" inputMode={unit === "adet" ? "numeric" : "decimal"} maxLength={unit === "adet" ? 6 : 10} defaultValue={countedValue} disabled={pending} required aria-label={`Sayılan miktar: ${productName}`} onChange={() => setEdited(true)} className="disabled:cursor-wait disabled:opacity-50" aria-invalid={showQtyError || undefined} aria-describedby={showQtyError ? qtyErrorId : undefined} /></Field></div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Sayılan miktar kaydediliyor. Lütfen bekleyin.</span>}
      {state.error && !state.field && !pending ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : state.savedAt && !edited && !pending ? <span className="shrink-0 text-sm text-ok" role="status">Kaydedildi.</span> : null}
      {showQtyError ? <span id={qtyErrorId} className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : null}
    </form>
  );
}

export function CloseCountForm({ countId }: { countId: string }) {
  const { state, pending, onSubmit } = useFormAction(closeStockCount.bind(null, countId), {} as CountState);
  const [confirmed, setConfirmed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-3">
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" name="onay" checked={confirmed} disabled={pending} onChange={(e) => setConfirmed(e.target.checked)} aria-invalid={state.field === "onay" && !!state.error || undefined} aria-describedby={state.field === "onay" && state.error ? "count-close-confirm-error" : undefined} className="mt-1 size-4 accent-[var(--color-brand)] disabled:opacity-50" />
        <span>Sapmaları onaylıyorum: kapanışta sayılan ürünler için <b>sayım hareketi</b> yazılır, stok sayılan değere oturur. Sayılmayan ürünlere dokunulmaz.</span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><Field label="Not (isteğe bağlı)" hint="En fazla 200 karakter"><Input name="note" placeholder="ör. yılbaşı sayımı" maxLength={200} disabled={pending} className="disabled:cursor-wait disabled:opacity-50" /></Field></div>
        <Button type="submit" disabled={pending || !confirmed}>{pending ? "Kapatılıyor…" : "Sayımı kapat"}</Button>
      </div>
      {pending && <p className="sr-only" role="status" aria-live="polite">Sayım kapatılıyor. Stok hareketleri kaydediliyor.</p>}
      {!confirmed && <p className="text-xs text-muted">Kapatmak için yukarıdaki onayı işaretleyin.</p>}
      {state.error ? <p id={state.field === "onay" ? "count-close-confirm-error" : undefined} className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p> : null}
    </form>
  );
}

export function CancelCountForm({ countId }: { countId: string }) {
  return <ConfirmActionForm action={cancelStockCount.bind(null, countId)} label="Oturumu iptal et" prompt="Açık sayım oturumu ve girilen sayım değerleri silinecek. Devam etmek istiyor musunuz?" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-bad/25 bg-surface px-2.5 text-[13px] font-medium text-bad shadow-rest hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20" />;
}
