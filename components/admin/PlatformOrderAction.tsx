"use client";

import { useFormStatus } from "react-dom";

function Submit({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
        {pending ? pendingLabel : label}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">{pendingLabel}</span>}
    </>
  );
}

export function PlatformOrderAction({ action, label, pendingLabel, className }: {
  action: () => void | Promise<void>;
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const runAction = async () => {
    await action();
    document.getElementById("platform-orders-heading")?.focus();
  };

  return <form action={runAction}><Submit label={label} pendingLabel={pendingLabel} className={className} /></form>;
}
