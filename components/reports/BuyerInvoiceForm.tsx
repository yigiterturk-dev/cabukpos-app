"use client";
import { resolveBuyerInvoice, type FiscalState } from "@/lib/admin/fiscal-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Input } from "@/components/ui";

export function BuyerInvoiceForm({ id, today }: { id: string; today: string }) {
  const { state, pending, onSubmit } = useFormAction(resolveBuyerInvoice, {} as FiscalState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="no" aria-label="Alıcının fatura no" placeholder="Fatura no" className="!w-44" required />
      <Input name="date" type="date" aria-label="Fatura tarihi" defaultValue={today} max={today} className="!w-40" required />
      <Button type="submit" size="sm" disabled={pending} className="h-[38px]">{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {state.error && <p className="basis-full break-words text-xs text-bad" role="alert" aria-live="assertive">{state.error}</p>}
    </form>
  );
}
