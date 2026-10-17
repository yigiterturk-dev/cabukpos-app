"use client";
// components/admin/MfaForms.tsx — 2FA kurulum/kapatma formları (app/yonetim/guvenlik).
import { mfaBasla, mfaOnayla, mfaKapat, type MfaState } from "@/lib/auth/actions";
import { useEffect, useRef } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function MfaAc() {
  const baslat = useFormAction(mfaBasla, {} as MfaState);
  const onayla = useFormAction(mfaOnayla, {} as MfaState);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!onayla.state.error) return;
    requestAnimationFrame(() => codeRef.current?.focus());
  }, [onayla.state.error]);
  const s = baslat.state;
  const hazir = s.secret && s.url ? { secret: s.secret, url: s.url } : null;
  if (onayla.state.ok) return <p role="status" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok">{onayla.state.ok}</p>;
  if (!hazir) {
    return (
      <form onSubmit={baslat.onSubmit} aria-busy={baslat.pending} className="space-y-3">
        <p className="text-sm text-muted">Kimlik doğrulayıcı uygulamanız (Google Authenticator, Aegis vb.) ile ekleyin.</p>
        <Button type="submit" disabled={baslat.pending}>
          {baslat.pending ? "Üretiliyor…" : "Kurulumu başlat"}
        </Button>
        {baslat.pending && <p className="sr-only" role="status" aria-live="polite">İki adımlı doğrulama kurulumu başlatılıyor.</p>}
        {s.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p>}
      </form>
    );
  }
  return (
    <form onSubmit={onayla.onSubmit} aria-busy={onayla.pending} className="space-y-4">
      <p className="rounded-[14px] bg-surface-2 p-3 font-mono text-sm break-all">{hazir.secret}</p>
      <p className="text-xs text-muted">Uygulamanıza elle eklerken: tür TOTP, SHA1, 6 hane, 30 saniye.</p>
      <input type="hidden" name="secret" value={hazir.secret} />
      <Field label="Uygulamadaki 6 haneli kod"><Input ref={codeRef} name="kod" disabled={onayla.pending} inputMode="numeric" autoComplete="one-time-code" required aria-invalid={!!onayla.state.error || undefined} aria-describedby={onayla.state.error ? "mfa-code-error" : undefined} /></Field>
      {onayla.state.error && <p id="mfa-code-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{onayla.state.error}</p>}
      <Button type="submit" disabled={onayla.pending}>{onayla.pending ? "Doğrulanıyor…" : "Kodu doğrula ve aç"}</Button>
      {onayla.pending && <p className="sr-only" role="status" aria-live="polite">İki adımlı doğrulama kodu doğrulanıyor.</p>}
    </form>
  );
}

export function MfaKapat() {
  const { state, pending, onSubmit } = useFormAction(mfaKapat, {} as MfaState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error]);
  if (state.ok) return <p role="status" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok">{state.ok}</p>;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <Field label="Şifreniz" hint="Kapatmak için şifrenizi yeniden girin"><PasswordInput name="sifre" disabled={pending} autoComplete="current-password" required aria-invalid={!!state.error || undefined} aria-describedby={state.error ? "mfa-password-error" : undefined} /></Field>
      {state.error && <p id="mfa-password-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kapatılıyor…" : "2FA'yı kapat"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">İki adımlı doğrulama kapatılıyor.</p>}
    </form>
  );
}
