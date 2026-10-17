"use client";
// #16: Tercihler'de para birimi seçimi. Kaydedince yönetim panelleri tazelenir.
import { CURRENCIES, type Currency } from "@/lib/core/money";
import { useFormAction } from "@/components/useFormAction";
import { Button } from "@/components/ui";
import { Select } from "@/components/Select";
import { setTenantCurrency } from "@/lib/admin/currency-actions";

export function CurrencySecimi({ currency }: { currency: Currency }) {
  const { state, pending, onSubmit } = useFormAction(setTenantCurrency, {} as { error?: string; ok?: boolean });
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <Select key={currency} disabled={pending} ariaLabel="Para birimi" name="currency" defaultValue={currency} options={Object.entries(CURRENCIES).map(([c, { ad }]) => ({ value: c, label: `${ad} (${c})` }))} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {state.ok ? <span className="shrink-0 text-sm text-ok" role="status">Kaydedildi.</span> : state.error ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : null}
    </form>
  );
}
