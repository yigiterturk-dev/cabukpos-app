"use client";
// #8: yıkıcı aksiyon (iptal) formu — tekrar kimlik doğrulama (şifre) ister.
import { useActionState, useEffect, useId, useRef } from "react";
import { PasswordInput } from "@/components/PasswordInput";

export function RevokeForm({ action, label = "İptal et", ariaLabel = label, revoked = false }: { action: (s: { error?: string }, f: FormData) => Promise<{ error?: string }>; label?: string; ariaLabel?: string; revoked?: boolean }) {
  const [state, dispatch, pending] = useActionState(action, {} as { error?: string });
  const errorId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const revokedRef = useRef<HTMLSpanElement>(null);
  const wasRevokedRef = useRef(revoked);
  useEffect(() => {
    if (!state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error]);
  useEffect(() => {
    const changedToRevoked = !wasRevokedRef.current && revoked;
    wasRevokedRef.current = revoked;
    if (!changedToRevoked || state.error) return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) revokedRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revoked, state.error]);
  if (revoked) return <span ref={revokedRef} tabIndex={-1} className="text-xs text-muted outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" role="status" aria-live="polite">İptal edildi.</span>;
  return (
    <form ref={formRef} action={dispatch} aria-busy={pending} className="flex flex-wrap items-center justify-end gap-2">
      <PasswordInput name="sifre" required autoComplete="current-password" placeholder="Şifreniz" aria-label="Şifreniz" disabled={pending} aria-invalid={!!state.error || undefined} aria-describedby={state.error ? errorId : undefined} className="min-h-11 w-40 px-2 text-base lg:text-sm" />
      <button type="submit" aria-label={pending ? `${ariaLabel} işleniyor` : ariaLabel} disabled={pending} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-bad outline-none hover:bg-bad-soft hover:underline focus-visible:ring-4 focus-visible:ring-bad/20 disabled:opacity-40">{pending ? "İşleniyor…" : label}</button>
      {pending && <span className="sr-only" role="status" aria-live="polite">İptal işlemi uygulanıyor.</span>}
      {state.error && <span id={errorId} className="max-w-full break-words text-xs text-bad" role="alert" aria-live="assertive">{state.error}</span>}
    </form>
  );
}
