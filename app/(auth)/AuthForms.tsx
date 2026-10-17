"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { login, requestReset, resetPassword, signup, type AuthState } from "@/lib/auth/actions";
import { useFormAction } from "@/components/useFormAction";
import { Store, UtensilsCrossed } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

const Err = ({ s, f }: { s: AuthState; f: string }) => (s.field === f && s.error ? <p id={`signup-${f}-error`} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);

export function SignupForm() {
  const { state, pending, onSubmit } = useFormAction(signup, {} as AuthState);
  const [vertical, setVertical] = useState(state.values?.vertical ?? "");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) first.current?.focus(); }, []);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-xs text-muted">Tüm alanlar zorunludur.</p>
      <Field label="İşletme adı"><Input ref={first} name="businessName" disabled={pending} autoComplete="organization" defaultValue={state.values?.businessName} required aria-invalid={state.field === "businessName" && !!state.error || undefined} aria-describedby={state.field === "businessName" && state.error ? "signup-businessName-error" : undefined} /></Field>
      <Err s={state} f="businessName" />
      <fieldset disabled={pending} aria-describedby={state.field === "vertical" && state.error ? "signup-vertical-error" : undefined} className="m-0 grid grid-cols-2 gap-2 border-0 p-0">
        <legend className="col-span-2 mb-1.5 text-sm font-medium">İşletme türü <span aria-hidden="true">*</span></legend>
        {([["restoran", "Restoran", UtensilsCrossed], ["market", "Market", Store]] as const).map(([v, l, I]) => (
          <label key={v} className={`press relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border px-3 py-3.5 text-sm font-medium outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${vertical === v ? "border-brand bg-brand-soft text-brand ring-4 ring-brand-ring/40" : "border-line text-ink-2 hover:border-line-strong hover:bg-surface-2"}`}>
            <input type="radio" name="vertical" value={v} required checked={vertical === v} onChange={() => setVertical(v)} aria-describedby={state.field === "vertical" && state.error ? "signup-vertical-error" : undefined} className="peer sr-only" />
            <I aria-hidden className="size-5" />{l}
          </label>
        ))}
        <div className="col-span-2"><Err s={state} f="vertical" /></div>
      </fieldset>
      <Field label="Ad soyad"><Input name="name" disabled={pending} defaultValue={state.values?.name} autoComplete="name" required aria-invalid={state.field === "name" && !!state.error || undefined} aria-describedby={state.field === "name" && state.error ? "signup-name-error" : undefined} /></Field>
      <Err s={state} f="name" />
      <Field label="E-posta"><Input name="email" disabled={pending} type="email" defaultValue={state.values?.email} autoComplete="email" required aria-invalid={state.field === "email" && !!state.error || undefined} aria-describedby={state.field === "email" && state.error ? "signup-email-error" : undefined} /></Field>
      <Err s={state} f="email" />
      <Field label="Şifre" hint="En az 10 karakter, harf ve rakam"><PasswordInput name="password" disabled={pending} autoComplete="new-password" minLength={10} required aria-invalid={state.field === "password" && !!state.error || undefined} aria-describedby={state.field === "password" && state.error ? "signup-password-error" : undefined} /></Field>
      <Err s={state} f="password" />
      <p className="text-xs text-muted">Hesap oluşturarak <Link href="/yasal/kullanim-kosullari" target="_blank" className="underline">Kullanım koşulları</Link>nı kabul etmiş ve <Link href="/yasal/kvkk" target="_blank" className="underline">KVKK aydınlatma metni</Link>ni okumuş olursunuz.</p>
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Oluşturuluyor…" : "Hesap oluştur"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">İşletme hesabı oluşturuluyor.</p>}
      <p className="text-center text-sm text-muted">Hesabınız var mı? <Link href="/giris" className="font-medium text-brand hover:underline">Giriş yapın</Link></p>
    </form>
  );
}

export function LoginForm() {
  const { state, pending, onSubmit } = useFormAction(login, {} as AuthState);
  const first = useRef<HTMLInputElement>(null);
  const mfa = useRef<HTMLInputElement>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const credentialsError = state.field === "credentials";
  const mfaError = state.field === "kod";
  useEffect(() => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) first.current?.focus(); }, []);
  useEffect(() => { if (mfaOpen || mfaError) mfa.current?.focus(); }, [mfaOpen, mfaError]);
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <Field label="E-posta"><Input ref={first} name="email" disabled={pending} type="email" defaultValue={state.values?.email} autoComplete="email" required aria-invalid={credentialsError || undefined} aria-describedby={credentialsError ? "login-credentials-error" : undefined} /></Field>
      <Field label="Şifre"><PasswordInput name="password" disabled={pending} autoComplete="current-password" required aria-invalid={credentialsError || undefined} aria-describedby={credentialsError ? "login-credentials-error" : undefined} /></Field>
      <details open={mfaOpen || mfaError} onToggle={(e) => setMfaOpen(e.currentTarget.open)} className="text-sm">
        <summary className="min-h-11 cursor-pointer select-none rounded py-2 outline-none text-muted hover:text-ink-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">İki adımlı doğrulama kodu (varsa)</summary>
        <div className="mt-2"><Field label="2FA kodu" hint="Uygulamadaki 6 haneli kod"><Input ref={mfa} name="kod" disabled={pending} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-invalid={mfaError || undefined} aria-describedby={mfaError ? "login-mfa-error" : undefined} /></Field></div>
      </details>
      <p className="-mt-2 text-right text-sm"><Link href="/sifremi-unuttum" className="inline-flex min-h-11 items-center text-muted underline">Şifremi unuttum</Link></p>
      {state.error && <p id={mfaError ? "login-mfa-error" : credentialsError ? "login-credentials-error" : undefined} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Giriş yapılıyor…" : "Giriş yap"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Oturum açılıyor.</p>}
      <p className="text-center text-sm text-muted">Yeni misiniz? <Link href="/kayit" className="font-medium text-brand hover:underline">İşletme hesabı açın</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { state, pending, onSubmit } = useFormAction(requestReset, {} as AuthState);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!state.ok && window.matchMedia("(hover: hover) and (pointer: fine)").matches) first.current?.focus(); }, [state.ok]);
  if (state.ok) return <p role="status" className="break-words rounded-[14px] bg-ok-soft p-4 text-sm text-ok">{state.ok}</p>;
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <Field label="E-posta"><Input ref={first} name="email" disabled={pending} type="email" defaultValue={state.values?.email} autoComplete="email" required aria-invalid={state.field === "email" || undefined} aria-describedby={state.field === "email" && state.error ? "forgot-email-error" : undefined} /></Field>
      {state.error && <p id={state.field === "email" ? "forgot-email-error" : undefined} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Gönderiliyor…" : "Yenileme bağlantısı gönder"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Şifre yenileme bağlantısı isteniyor.</p>}
      <p className="text-center text-sm text-muted"><Link href="/giris" className="inline-flex min-h-11 items-center font-medium text-brand hover:underline">Girişe dön</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { state, pending, onSubmit } = useFormAction(resetPassword, {} as AuthState);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) first.current?.focus(); }, []);
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <Field label="Yeni şifre" hint="En az 10 karakter, harf ve rakam"><PasswordInput ref={first} name="password" disabled={pending} autoComplete="new-password" minLength={10} required aria-invalid={state.field === "password" || undefined} aria-describedby={state.field === "password" && state.error ? "reset-password-error" : undefined} /></Field>
      {state.error && <p id={state.field === "password" ? "reset-password-error" : undefined} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}{!state.field && <> <Link href="/sifremi-unuttum" className="underline">Yeni bağlantı</Link></>}</p>}
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Kaydediliyor…" : "Şifreyi kaydet"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Yeni şifre kaydediliyor.</p>}
    </form>
  );
}
