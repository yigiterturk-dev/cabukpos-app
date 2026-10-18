"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Action = (formData: FormData) => void | Promise<void>;

function PendingSubmit({ label, pendingLabel, ariaLabel, pendingStatus, buttonClassName }: {
  label: string;
  pendingLabel: string;
  ariaLabel?: string;
  pendingStatus: string;
  buttonClassName: string;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} aria-label={pending ? `${pendingLabel}${ariaLabel ? `: ${ariaLabel}` : ""}` : ariaLabel} className={`${buttonClassName} disabled:cursor-wait disabled:opacity-50`}>
        {pending ? pendingLabel : label}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">{pendingStatus}</span>}
    </>
  );
}

export function PendingActionForm({ action, label, pendingLabel = "Kaydediliyor…", ariaLabel, pendingStatus, formClassName = "", buttonClassName = "inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60", children }: {
  action: Action;
  label: string;
  pendingLabel?: string;
  ariaLabel?: string;
  pendingStatus: string;
  formClassName?: string;
  buttonClassName?: string;
  children?: ReactNode;
}) {
  return (
    <form action={action} className={formClassName}>
      {children}
      <PendingSubmit label={label} pendingLabel={pendingLabel} ariaLabel={ariaLabel} pendingStatus={pendingStatus} buttonClassName={buttonClassName} />
    </form>
  );
}
