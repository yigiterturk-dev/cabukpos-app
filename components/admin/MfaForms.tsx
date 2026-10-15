"use client";
// components/admin/MfaForms.tsx — 2FA kurulum/kapatma formları (app/yonetim/guvenlik).
import { mfaBasla, mfaOnayla, mfaKapat, type MfaState } from "@/lib/auth/actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function MfaAc() {
  const baslat = useFormAction(mfaBasla, {} as MfaState);
  const onayla = useFormAction(mfaOnayla, {} as MfaState);
  const s = baslat.state;
  const hazir = s.secret && s.url ? { secret: s.secret, url: s.url } : null;
  if (onayla.state.ok) return <p role="status" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok">{onayla.state.ok}</p>;
  if (!hazir) {
    return (
      <form onSubmit={baslat.onSubmit} className="space-y-3">
        <p className="text-sm text-muted">Kimlik doğrulayıcı uygulamanız (Google Authenticator, Aegis vb.) ile ekleyin.</p>
        <Button type="submit" disabled={baslat.pending}>
          {baslat.pending ? "Üretiliyor…" : "Kurulumu başlat"}
        </Button>
        {s.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p>}
      </form>
    );
  }
  return (
    <form onSubmit={onayla.onSubmit} className="space-y-4">
      <p className="rounded-[14px] bg-surface-2 p-3 font-mono text-sm break-all">{hazir.secret}</p>
      <p className="text-xs text-muted">Uygulamanıza elle eklerken: tür TOTP, SHA1, 6 hane, 30 saniye.</p>
      <input type="hidden" name="secret" value={hazir.secret} />
      <Field label="Uygulamadaki 6 haneli kod"><Input name="kod" inputMode="numeric" autoComplete="one-time-code" required /></Field>
      {onayla.state.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{onayla.state.error}</p>}
      <Button type="submit" disabled={onayla.pending}>{onayla.pending ? "Doğrulanıyor…" : "Kodu doğrula ve aç"}</Button>
    </form>
  );
}

export function MfaKapat() {
  const { state, pending, onSubmit } = useFormAction(mfaKapat, {} as MfaState);
  if (state.ok) return <p role="status" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok">{state.ok}</p>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Şifreniz" hint="Kapatmak için şifrenizi yeniden girin"><PasswordInput name="sifre" autoComplete="current-password" required /></Field>
      {state.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kapatılıyor…" : "2FA'yı kapat"}</Button>
    </form>
  );
}
