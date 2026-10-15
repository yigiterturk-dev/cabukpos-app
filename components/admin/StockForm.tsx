"use client";
import { useState } from "react";
import type { StockUnit } from "@/lib/core/stock";
import { addStockMove, type StockState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const KINDS = [["sayim", "Sayım (=)"], ["fire", "Fire (−)"]] as const;

export function StockForm({ productId, unit }: { productId: string; unit: StockUnit }) {
  const { state, pending, onSubmit } = useFormAction(addStockMove.bind(null, productId), {} as StockState);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("sayim");
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-1" role="group" aria-label="Hareket türü">
        {KINDS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${kind === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>
      <div className="w-36"><Field label={kind === "sayim" ? "Sayılan" : "Miktar"} hint={unit}><Input key={`q${state.savedAt ?? 0}`} name="qty" inputMode="decimal" required /></Field></div>
      <div className="min-w-48 flex-1"><Field label="Not" hint={kind === "fire" ? "zorunlu" : "isteğe bağlı"}><Input key={`n${state.savedAt ?? 0}`} name="note" /></Field></div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      <div className="basis-full text-sm" aria-live="polite">
        {state.error ? <span className="max-w-full break-words text-bad" role="alert" aria-live="assertive">{state.error}</span> : state.savedAt ? <span className="text-ok" role="status">Kaydedildi.</span> : null}
      </div>
    </form>
  );
}
