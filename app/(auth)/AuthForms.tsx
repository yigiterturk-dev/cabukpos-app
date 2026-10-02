"use client";
import Link from "next/link";
import { useState } from "react";
import { login, requestReset, resetPassword, signup, type AuthState } from "@/lib/auth/actions";
import { useFormAction } from "@/components/useFormAction";
import { Store, UtensilsCrossed } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: AuthState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-sm text-bad">{s.error}</p> : null);

export function SignupForm() {
  const { state, pending, onSubmit } = useFormAction(signup, {} as AuthState);
  const [vertical, setVertical] = useState(state.values?.vertical ?? "");
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="İşletme adı"><Input name="businessName" defaultValue={state.values?.businessName} required /></Field>
      <Err s={state} f="businessName" />
      <div>
        <div className="mb-1.5 text-sm font-medium">İşletme türü</div>
        <input type="hidden" name="vertical" value={vertical} />
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="İşletme türü">
          {([["restoran", "Restoran", UtensilsCrossed], ["market", "Market", Store]] as const).map(([v, l, I]) => (
            <button key={v} type="button" aria-pressed={vertical === v} onClick={() => setVertical(v)} className={`press flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-[10px] border px-3 py-3.5 text-sm font-medium outline-none transition focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${vertical === v ? "border-brand bg-brand-soft text-brand ring-4 ring-brand-ring/40" : "border-line text-ink-2 hover:border-line-strong hover:bg-surface-2"}`}><I aria-hidden className="size-5" />{l}</button>
          ))}
        </div>
        <Err s={state} f="vertical" />
      </div>
      <Field label="Ad soyad"><Input name="name" defaultValue={state.values?.name} autoComplete="name" required /></Field>
      <Err s={state} f="name" />
      <Field label="E-posta"><Input name="email" type="email" defaultValue={state.values?.email} autoComplete="email" required /></Field>
      <Err s={state} f="email" />
      <Field label="Şifre" hint="En az 10 karakter, harf ve rakam"><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Err s={state} f="password" />
      <p className="text-xs text-muted">Hesap oluşturarak <Link href="/yasal/kullanim-kosullari" target="_blank" className="underline">Kullanım koşulları</Link>nı kabul etmiş ve <Link href="/yasal/kvkk" target="_blank" className="underline">KVKK aydınlatma metni</Link>ni okumuş olursunuz.</p>
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Oluşturuluyor…" : "Hesap oluştur"}</Button>
      <p className="text-center text-sm text-muted">Hesabınız var mı? <Link href="/giris" className="font-medium text-brand hover:underline">Giriş yapın</Link></p>
    </form>
  );
}

export function LoginForm() {
  const { state, pending, onSubmit } = useFormAction(login, {} as AuthState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-posta"><Input name="email" type="email" defaultValue={state.values?.email} autoComplete="email" required /></Field>
      <Field label="Şifre"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      <Field label="2FA kodu" hint="İki adımlı doğrulama açtıysanız uygulamadaki 6 haneli kod"><Input name="kod" inputMode="numeric" autoComplete="one-time-code" /></Field>
      <p className="-mt-2 text-right text-sm"><Link href="/sifremi-unuttum" className="text-muted underline">Şifremi unuttum</Link></p>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Giriş yapılıyor…" : "Giriş yap"}</Button>
      <p className="text-center text-sm text-muted">Yeni misiniz? <Link href="/kayit" className="font-medium text-brand hover:underline">İşletme hesabı açın</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { state, pending, onSubmit } = useFormAction(requestReset, {} as AuthState);
  if (state.ok) return <p role="status" className="rounded-[14px] bg-ok-soft p-4 text-sm text-ok">{state.ok}</p>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-posta"><Input name="email" type="email" defaultValue={state.values?.email} autoComplete="email" required /></Field>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Gönderiliyor…" : "Yenileme bağlantısı gönder"}</Button>
      <p className="text-center text-sm text-muted"><Link href="/giris" className="font-medium text-brand hover:underline">Girişe dön</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { state, pending, onSubmit } = useFormAction(resetPassword, {} as AuthState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <Field label="Yeni şifre" hint="En az 10 karakter, harf ve rakam"><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      {state.error && <p className="text-sm text-bad">{state.error}{!state.field && <> <Link href="/sifremi-unuttum" className="underline">Yeni bağlantı</Link></>}</p>}
      <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Kaydediliyor…" : "Şifreyi kaydet"}</Button>
    </form>
  );
}
