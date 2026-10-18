"use client";
// components/admin/MfaForms.tsx — 2FA kurulum/kapatma formları (app/yonetim/guvenlik).
import { mfaBasla, mfaOnayla, mfaKapat, type MfaState } from "@/lib/auth/actions";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function MfaSection({ enabled }: { enabled: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousRef = useRef(enabled);
  useEffect(() => {
    if (previousRef.current === enabled) return;
    previousRef.current = enabled;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [enabled]);
  return (
    <section className="rounded-[14px] border border-line bg-surface p-5">
      <h2 ref={headingRef} tabIndex={-1} className="mb-1 font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">İki adımlı doğrulama (2FA)</h2>
      <p className="mb-4 text-sm text-muted" role="status">{enabled ? "Açık — girişte kimlik doğrulayıcı kodu isteniyor." : "Kapalı — şifreniz tek başına yeterli."}</p>
      {enabled ? <MfaKapat /> : <MfaAc />}
    </section>
  );
}

export function MfaAc() {
  const router = useRouter();
  const baslat = useFormAction(mfaBasla, {} as MfaState);
  const onayla = useFormAction(mfaOnayla, {} as MfaState);
  const codeRef = useRef<HTMLInputElement>(null);
  const [edited, setEdited] = useState(false);
  const displayError = edited || onayla.pending ? undefined : onayla.state.error;
  useEffect(() => { if (onayla.state.ok) router.refresh(); }, [onayla.state.ok, router]);
  useEffect(() => {
    if (!displayError) return;
    requestAnimationFrame(() => codeRef.current?.focus());
  }, [displayError]);
  const s = baslat.state;
  const hazir = s.secret && s.url ? { secret: s.secret, url: s.url } : null;
  if (onayla.state.ok) return <p tabIndex={-1} role="status" aria-live="polite" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok outline-none focus-visible:ring-4 focus-visible:ring-ok/30">{onayla.state.ok}</p>;
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
    <form onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onayla.onSubmit(e); }} aria-busy={onayla.pending} className="space-y-4">
      <p className="rounded-[14px] bg-surface-2 p-3 font-mono text-sm break-all">{hazir.secret}</p>
      <p className="text-xs text-muted">Uygulamanıza elle eklerken: tür TOTP, SHA1, 6 hane, 30 saniye.</p>
      <input type="hidden" name="secret" value={hazir.secret} />
      <Field label="Uygulamadaki 6 haneli kod"><Input ref={codeRef} name="kod" disabled={onayla.pending} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} pattern="[0-9]{6}" required aria-invalid={!!displayError || undefined} aria-describedby={displayError ? "mfa-code-error" : undefined} /></Field>
      {displayError && <p id="mfa-code-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayError}</p>}
      <Button type="submit" disabled={onayla.pending}>{onayla.pending ? "Doğrulanıyor…" : "Kodu doğrula ve aç"}</Button>
      {onayla.pending && <p className="sr-only" role="status" aria-live="polite">İki adımlı doğrulama kodu doğrulanıyor.</p>}
    </form>
  );
}

export function MfaKapat() {
  const router = useRouter();
  const { state, pending, onSubmit } = useFormAction(mfaKapat, {} as MfaState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayError = edited || pending ? undefined : state.error;
  useEffect(() => { if (state.ok) router.refresh(); }, [router, state.ok]);
  useEffect(() => {
    if (!displayError) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [displayError]);
  if (state.ok) return <p tabIndex={-1} role="status" aria-live="polite" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok outline-none focus-visible:ring-4 focus-visible:ring-ok/30">{state.ok}</p>;
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="space-y-4">
      <Field label="Şifreniz" hint="Kapatmak için şifrenizi yeniden girin"><PasswordInput name="sifre" disabled={pending} autoComplete="current-password" required aria-invalid={!!displayError || undefined} aria-describedby={displayError ? "mfa-password-error" : undefined} /></Field>
      {displayError && <p id="mfa-password-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayError}</p>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kapatılıyor…" : "2FA'yı kapat"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">İki adımlı doğrulama kapatılıyor.</p>}
    </form>
  );
}
