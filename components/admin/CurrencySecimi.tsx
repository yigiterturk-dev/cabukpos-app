"use client";
import { useEffect, useRef, useState } from "react";
// #16: Tercihler'de para birimi seçimi. Kaydedince yönetim panelleri tazelenir.
import { CURRENCIES, type Currency } from "@/lib/core/money";
import { useFormAction } from "@/components/useFormAction";
import { Button } from "@/components/ui";
import { Select } from "@/components/Select";
import { setTenantCurrency } from "@/lib/admin/currency-actions";

export function CurrencySecimi({ currency }: { currency: Currency }) {
  const { state, pending, onSubmit } = useFormAction(setTenantCurrency, {} as { error?: string; ok?: boolean });
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? {} : state;
  useEffect(() => {
    if (!state.ok) return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state]);
  return (
    <form ref={formRef} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="flex flex-wrap items-center gap-2">
      <Select key={currency} disabled={pending} ariaLabel="Para birimi" name="currency" defaultValue={currency} onChange={() => setEdited(true)} options={Object.entries(CURRENCIES).map(([c, { ad }]) => ({ value: c, label: `${ad} (${c})` }))} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {displayState.ok ? <span className="shrink-0 text-sm text-ok" role="status">Kaydedildi.</span> : displayState.error ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</span> : null}
    </form>
  );
}
