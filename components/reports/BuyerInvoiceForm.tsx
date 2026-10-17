"use client";
import { resolveBuyerInvoice, type FiscalState } from "@/lib/admin/fiscal-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Input } from "@/components/ui";

export function BuyerInvoiceForm({ id, today }: { id: string; today: string }) {
  const { state, pending, onSubmit } = useFormAction(resolveBuyerInvoice, {} as FiscalState);
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-start">
      <input type="hidden" name="id" value={id} />
      <Input name="no" disabled={pending} aria-label="Alıcının fatura no" placeholder="Fatura no" className="!w-full sm:!w-44" required />
      <Input name="date" disabled={pending} type="date" aria-label="Fatura tarihi" defaultValue={today} max={today} className="!w-full sm:!w-40" required />
      <Button type="submit" size="sm" disabled={pending} className="min-h-11 sm:h-[38px]">{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Alıcı fatura bilgisi kaydediliyor.</p>}
      {state.error && <p className="basis-full break-words text-xs text-bad" role="alert" aria-live="assertive">{state.error}</p>}
    </form>
  );
}
