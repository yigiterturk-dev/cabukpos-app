"use client";
import { useEffect, useRef, useState } from "react";
import { resolveBuyerInvoice, type FiscalState } from "@/lib/admin/fiscal-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Input } from "@/components/ui";

export function BuyerInvoiceForm({ id, today }: { id: string; today: string }) {
  const { state, pending, onSubmit } = useFormAction(resolveBuyerInvoice, {} as FiscalState);
  const [edited, setEdited] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const displayState = edited || pending ? ({} as FiscalState) : state;
  useEffect(() => {
    if (!displayState.error || !displayState.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [displayState.error, displayState.field]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-start">
      <input type="hidden" name="id" value={id} />
      <Input name="no" disabled={pending} aria-label="Alıcının fatura no" placeholder="Fatura no" className="!w-full sm:!w-44" required aria-invalid={displayState.field === "no" || undefined} aria-describedby={displayState.field === "no" && displayState.error ? "buyer-invoice-error" : undefined} />
      <Input name="date" disabled={pending} type="date" aria-label="Fatura tarihi" defaultValue={today} max={today} className="!w-full sm:!w-40" required aria-invalid={displayState.field === "date" || undefined} aria-describedby={displayState.field === "date" && displayState.error ? "buyer-invoice-error" : undefined} />
      <Button type="submit" size="sm" disabled={pending} className="min-h-11 sm:h-[38px]">{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Alıcı fatura bilgisi kaydediliyor.</p>}
      {displayState.error && <p id={displayState.field ? "buyer-invoice-error" : undefined} className="basis-full break-words text-xs text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
    </form>
  );
}
