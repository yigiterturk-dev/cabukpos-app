"use client";
import { useEffect, useRef, useState } from "react";
import type { StockUnit } from "@/lib/core/stock";
import { addStockMove, type StockState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const KINDS = [["sayim", "Sayım (=)"], ["fire", "Fire (−)"]] as const;
const errorProps = (state: StockState, field: string) => state.field === field && state.error
  ? { "aria-invalid": true as const, "aria-describedby": `stock-${field}-error` }
  : {};

export function StockForm({ productId, unit }: { productId: string; unit: StockUnit }) {
  const { state, pending, onSubmit } = useFormAction(addStockMove.bind(null, productId), {} as StockState);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("sayim");
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? {} as StockState : state;
  const qtyHint = unit === "adet"
    ? `${kind === "sayim" ? "0 dahil" : "0'dan büyük"} tam sayı · en fazla 999.999`
    : `${kind === "sayim" ? "0 dahil · " : ""}en fazla 999.999,999 ${unit} · en çok 3 ondalık`;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="qty"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="flex flex-wrap items-end gap-3">
      <fieldset disabled={pending} aria-describedby={displayState.field === "kind" && displayState.error ? "stock-kind-error" : undefined} className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">Hareket türü</legend>
        <div className="flex gap-1">
          {KINDS.map(([v, l]) => (
            <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${kind === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>
              <input type="radio" name="kind" value={v} required checked={kind === v} onChange={() => setKind(v)} aria-invalid={displayState.field === "kind" && !!displayState.error || undefined} aria-describedby={displayState.field === "kind" && displayState.error ? "stock-kind-error" : undefined} className="peer sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="w-36"><Field label={kind === "sayim" ? "Sayılan" : "Miktar"} hint={qtyHint}><Input key={`q${state.savedAt ?? 0}`} name="qty" inputMode={unit === "adet" ? "numeric" : "decimal"} maxLength={unit === "adet" ? 6 : 10} disabled={pending} required className="disabled:cursor-wait disabled:opacity-50" {...errorProps(displayState, "qty")} /></Field></div>
      <div className="min-w-48 flex-1"><Field label="Not" hint={`${kind === "fire" ? "zorunlu" : "isteğe bağlı"} · en fazla 200 karakter`}><Input key={`n${state.savedAt ?? 0}`} name="note" maxLength={200} disabled={pending} required={kind === "fire"} className="disabled:cursor-wait disabled:opacity-50" {...errorProps(displayState, "note")} /></Field></div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Stok hareketi kaydediliyor. Lütfen bekleyin.</span>}
      <div className="basis-full text-sm">
        {displayState.error ? <span id={displayState.field ? `stock-${displayState.field}-error` : undefined} className="max-w-full break-words text-bad" role="alert" aria-live="assertive">{displayState.error}</span> : state.savedAt && !edited && !pending && !state.error ? <span className="text-ok" role="status">Kaydedildi.</span> : null}
      </div>
    </form>
  );
}
