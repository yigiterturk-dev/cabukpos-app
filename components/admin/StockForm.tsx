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
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="flex flex-wrap items-end gap-3">
      <fieldset disabled={pending} aria-describedby={state.field === "kind" && state.error ? "stock-kind-error" : undefined} className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">Hareket türü</legend>
        <div className="flex gap-1">
          {KINDS.map(([v, l]) => (
            <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${kind === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>
              <input type="radio" name="kind" value={v} required checked={kind === v} onChange={() => setKind(v)} aria-invalid={state.field === "kind" && !!state.error || undefined} aria-describedby={state.field === "kind" && state.error ? "stock-kind-error" : undefined} className="peer sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="w-36"><Field label={kind === "sayim" ? "Sayılan" : "Miktar"} hint={unit}><Input key={`q${state.savedAt ?? 0}`} name="qty" inputMode={unit === "adet" ? "numeric" : "decimal"} disabled={pending} required className="disabled:cursor-wait disabled:opacity-50" {...errorProps(state, "qty")} /></Field></div>
      <div className="min-w-48 flex-1"><Field label="Not" hint={kind === "fire" ? "zorunlu" : "isteğe bağlı"}><Input key={`n${state.savedAt ?? 0}`} name="note" disabled={pending} required={kind === "fire"} className="disabled:cursor-wait disabled:opacity-50" {...errorProps(state, "note")} /></Field></div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Stok hareketi kaydediliyor. Lütfen bekleyin.</span>}
      <div className="basis-full text-sm">
        {state.error ? <span id={state.field ? `stock-${state.field}-error` : undefined} className="max-w-full break-words text-bad" role="alert" aria-live="assertive">{state.error}</span> : state.savedAt ? <span className="text-ok" role="status">Kaydedildi.</span> : null}
      </div>
    </form>
  );
}
