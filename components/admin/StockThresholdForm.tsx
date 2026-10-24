"use client";
// Şube bazlı kritik stok eşiği: boş bırakılırsa ürünün genel sınırı geçerli olur.
import { useState } from "react";
import { setStoreStockThreshold, type ThresholdState } from "@/lib/admin/stock-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { formatQty, type StockUnit } from "@/lib/core/stock";

const asInput = (milli: number | null, unit: StockUnit) => milli == null ? "" : unit === "adet" ? String(milli / 1000) : (milli / 1000).toFixed(3);

export function StockThresholdForm({ productId, unit, current, override }: {
  productId: string;
  unit: StockUnit;
  current: number | null;
  override: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(setStoreStockThreshold.bind(null, productId), {} as ThresholdState);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? {} as ThresholdState : state;
  const invalid = displayState.field === "minStock" && !!displayState.error;
  const hint = unit === "adet" ? "Boş = ürün varsayılanı · tam sayı" : `Boş = ürün varsayılanı · ${unit}, en çok 3 ondalık`;

  return (
    <form onSubmit={(e) => { setEdited(false); onSubmit(e); }} onChangeCapture={() => setEdited(true)} aria-busy={pending} className="space-y-2">
      <div className="text-sm font-medium">Kritik stok eşiği — bu şube</div>
      <p className="text-xs text-muted">
        Şu an: {current == null ? "uyarı yok" : `${formatQty(current, unit)} (${override ? "bu şube" : "ürün varsayılanı"})`}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Field label="Sınır" hint={hint}>
            <Input name="minStock" key={`${productId}-${state.savedAt ?? 0}`} inputMode={unit === "adet" ? "numeric" : "decimal"} maxLength={unit === "adet" ? 6 : 10} defaultValue={asInput(current, unit)} disabled={pending} aria-invalid={invalid || undefined} aria-describedby={invalid ? "threshold-error" : undefined} className="disabled:cursor-wait disabled:opacity-50" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Sınırı kaydet"}</Button>
      </div>
      {pending && <span className="sr-only" role="status" aria-live="polite">Şube stok eşiği kaydediliyor.</span>}
      {displayState.error ? <p id={invalid ? "threshold-error" : undefined} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p> : state.savedAt && !edited && !pending ? <span className="text-sm text-ok" role="status">Kaydedildi.</span> : null}
      <p className="text-xs text-muted">Boş kaydedersen bu şubede ürünün genel sınırına döner.</p>
    </form>
  );
}
