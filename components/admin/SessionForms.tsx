"use client";
// components/admin/SessionForms.tsx — #9 oturum düşme formları (app/yonetim/guvenlik).
import { digerOturumlariKapat, tumCihazlardanCik, type SessionState } from "@/lib/auth/actions";
import { useEffect, useId, useRef } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

function SifreliForm({ action, buton, variant }: { action: (s: SessionState, f: FormData) => Promise<SessionState>; buton: string; variant: "primary" | "danger" }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as SessionState);
  const formRef = useRef<HTMLFormElement>(null);
  const passwordErrorId = `session-password-error-${useId()}`;
  useEffect(() => {
    if (!state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-3">
      <Field label="Şifreniz" hint="Hassas işlem — şifrenizi yeniden girin"><PasswordInput name="sifre" disabled={pending} autoComplete="current-password" required aria-invalid={!!state.error || undefined} aria-describedby={state.error ? passwordErrorId : undefined} /></Field>
      {state.error && <p id={passwordErrorId} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-ok">{state.ok}</p>}
      <Button type="submit" variant={variant} disabled={pending}>{pending ? "Uygulanıyor…" : buton}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Oturum güvenlik işlemi uygulanıyor.</p>}
    </form>
  );
}

export function OturumKapatFormlari() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <SifreliForm action={digerOturumlariKapat} buton="Diğer cihazların oturumlarını kapat" variant="primary" />
      <SifreliForm action={tumCihazlardanCik} buton="Tüm cihazlardan çık" variant="danger" />
    </div>
  );
}
