"use client";
import { useState } from "react";
import { addStockMove, type StockState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const KINDS = [["alis", "Alış (+)"], ["fire", "Fire (−)"], ["sayim", "Sayım (=)"]] as const;

export function StockForm({ productId, unit }: { productId: string; unit: "adet" | "tartili" }) {
  const { state, pending, onSubmit } = useFormAction(addStockMove.bind(null, productId), {} as StockState);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("alis");
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-1" role="group" aria-label="Hareket türü">
        {KINDS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={`rounded-lg border px-3 py-2 text-sm ${kind === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{l}</button>
        ))}
      </div>
      <div className="w-36"><Field label={kind === "sayim" ? "Sayılan" : "Miktar"} hint={unit === "tartili" ? "kg" : "adet"}><Input key={`q${state.savedAt ?? 0}`} name="qty" inputMode="decimal" required /></Field></div>
      <div className="min-w-48 flex-1"><Field label="Not" hint={kind === "fire" ? "zorunlu" : "isteğe bağlı"}><Input key={`n${state.savedAt ?? 0}`} name="note" /></Field></div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      <div className="basis-full text-sm" aria-live="polite">
        {state.error ? <span className="text-red-700">{state.error}</span> : state.savedAt ? <span className="text-emerald-700">Kaydedildi.</span> : null}
      </div>
    </form>
  );
}
