"use client";
// #51 sayım oturumu formları.
import { setCountedLine, closeStockCount, cancelStockCount, startStockCount, type CountState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";

export function StartCountForm({ disabled }: { disabled?: boolean }) {
  return (
    <form action={startStockCount}>
      <Button type="submit" disabled={disabled}>Sayım başlat</Button>
    </form>
  );
}

export function CountLineForm({ countId, lineId, unit }: { countId: string; lineId: string; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(setCountedLine.bind(null, countId, lineId), {} as CountState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="w-32"><Field label="Sayılan" hint={unit}><Input name="qty" inputMode="decimal" required /></Field></div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "…" : "Kaydet"}</Button>
      {state.error && !state.field ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : state.savedAt ? <span className="shrink-0 text-sm text-ok" role="status">✓</span> : null}
      {state.error && state.field === "qty" ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : null}
    </form>
  );
}

export function CloseCountForm({ countId }: { countId: string }) {
  const { state, pending, onSubmit } = useFormAction(closeStockCount.bind(null, countId), {} as CountState);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="onay" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-[var(--color-brand)]" />
        <span>Sapmaları onaylıyorum: kapanışta sayılan ürünler için <b>sayım hareketi</b> yazılır, stok sayılan değere oturur. Sayılmayan ürünlere dokunulmaz.</span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><Field label="Not (isteğe bağlı)"><Input name="note" placeholder="ör. yılbaşı sayımı" /></Field></div>
        <Button type="submit" disabled={pending || !confirmed}>{pending ? "Kapatılıyor…" : "Sayımı kapat"}</Button>
      </div>
      {!confirmed && <p className="text-xs text-muted">Kapatmak için yukarıdaki onayı işaretleyin.</p>}
      {state.error ? <p className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p> : null}
    </form>
  );
}

export function CancelCountForm({ countId }: { countId: string }) {
  return (
    <form action={cancelStockCount.bind(null, countId)}>
      <Button type="submit" variant="danger" size="sm">Oturumu iptal et</Button>
    </form>
  );
}
