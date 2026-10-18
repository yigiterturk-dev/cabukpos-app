"use client";

import { useEffect, useRef } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Button } from "@/components/ui";
import type { AuthState } from "@/lib/auth/actions";

export function EmailVerificationForm({ action }: { action: (state: AuthState, formData: FormData) => Promise<AuthState> }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as AuthState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.ok) return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending}>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Gönderiliyor…" : "Doğrulama e-postası gönder"}
      </Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Doğrulama e-postası gönderiliyor. Lütfen bekleyin.</span>}
      {state.ok && <p className="mt-2 text-sm text-ok" role="status" aria-live="polite">{state.ok}</p>}
      {state.error && <p className="mt-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
    </form>
  );
}
