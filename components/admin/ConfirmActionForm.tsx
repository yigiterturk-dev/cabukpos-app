"use client";

import { useFormStatus } from "react-dom";

function ConfirmSubmitButton({ label, className, ariaLabel }: { label: string; className: string; ariaLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" aria-label={ariaLabel} aria-busy={pending || undefined} disabled={pending}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}>
        {pending ? "İşleniyor…" : label}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">{ariaLabel ?? label} işlemi uygulanıyor.</span>}
    </>
  );
}

export function ConfirmActionForm({ action, label, prompt, className, fields = {}, ariaLabel }: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  prompt: string;
  className: string;
  fields?: Record<string, string>;
  ariaLabel?: string;
}) {
  return (
    <form action={action} onSubmit={(event) => { if (!window.confirm(prompt)) event.preventDefault(); }}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <ConfirmSubmitButton label={label} className={className} ariaLabel={ariaLabel} />
    </form>
  );
}
