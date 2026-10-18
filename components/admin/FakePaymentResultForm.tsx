"use client";

import { useFormStatus } from "react-dom";

type Action = (formData: FormData) => void | Promise<void>;

function ResultButton({ ok, label, pendingLabel, className }: { ok: "0" | "1"; label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return <button name="ok" value={ok} disabled={pending} aria-busy={pending || undefined} className={`${className} disabled:cursor-wait disabled:opacity-50`}>{pending ? pendingLabel : label}</button>;
}

function PendingMessage() {
  const { pending } = useFormStatus();
  return pending ? <span className="sr-only" role="status" aria-live="polite">Test ödeme sonucu kaydediliyor.</span> : null;
}

export function FakePaymentResultForm({ action, paymentId }: { action: Action; paymentId: string }) {
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="id" value={paymentId} />
      <ResultButton ok="0" label="Başarısız" pendingLabel="Kaydediliyor…" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-line px-3 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
      <ResultButton ok="1" label="Ödemeyi onayla" pendingLabel="Onaylanıyor…" className="inline-flex min-h-12 flex-[2] items-center justify-center rounded-lg bg-brand-action px-3 font-medium text-white outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
      <PendingMessage />
    </form>
  );
}
