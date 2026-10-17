"use client";

import { useFormStatus } from "react-dom";

function QueryButton() {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className="press inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Sorgulanıyor…" : "Şimdi sorgula"}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">e-Fatura zarfları sorgulanıyor. Lütfen bekleyin.</span>}
    </>
  );
}

export function EnvelopeQueryForm({ action }: { action: () => void | Promise<void> }) {
  return <form action={action} className="ml-auto shrink-0"><QueryButton /></form>;
}
