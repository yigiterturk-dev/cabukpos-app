"use client";
// #51 sayım oturumu formları.
import { setCountedLine, closeStockCount, cancelStockCount, startStockCount, type CountState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
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
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <div className="w-32"><Field label="Sayılan" hint={unit}><Input name="qty" inputMode="decimal" required /></Field></div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "…" : "Kaydet"}</Button>
      {state.error && !state.field ? <span className="text-sm text-bad">{state.error}</span> : state.savedAt ? <span className="text-sm text-ok">✓</span> : null}
      {state.error && state.field === "qty" ? <span className="text-sm text-bad">{state.error}</span> : null}
    </form>
  );
}

export function CloseCountForm({ countId }: { countId: string }) {
  const { state, pending, onSubmit } = useFormAction(closeStockCount.bind(null, countId), {} as CountState);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="onay" className="mt-1 size-4 accent-[var(--color-brand)]" />
        <span>Sapmaları onaylıyorum: kapanışta sayılan ürünler için <b>sayım hareketi</b> yazılır, stok sayılan değere oturur. Sayılmayan ürünlere dokunulmaz.</span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><Field label="Not (isteğe bağlı)"><Input name="note" placeholder="ör. yılbaşı sayımı" /></Field></div>
        <Button type="submit" disabled={pending}>{pending ? "Kapatılıyor…" : "Sayımı kapat"}</Button>
      </div>
      {state.error ? <p className="text-sm text-bad">{state.error}</p> : null}
    </form>
  );
}

export function CancelCountForm({ countId }: { countId: string }) {
  return (
    <form action={cancelStockCount.bind(null, countId)}>
      <button className="text-sm text-bad hover:underline">Oturumu iptal et</button>
    </form>
  );
}
