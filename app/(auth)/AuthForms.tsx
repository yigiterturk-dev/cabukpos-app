"use client";
import Link from "next/link";
import { useState } from "react";
import { login, signup, type AuthState } from "@/lib/auth/actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: AuthState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-sm text-red-700">{s.error}</p> : null);

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
          {[["restoran", "Restoran"], ["market", "Market"]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={vertical === v} onClick={() => setVertical(v)} className={`rounded-lg border px-3 py-3 text-sm font-medium ${vertical === v ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-stone-50"}`}>{l}</button>
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
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Oluşturuluyor…" : "Hesap oluştur"}</Button>
      <p className="text-center text-sm text-muted">Hesabınız var mı? <Link href="/giris" className="text-brand underline">Giriş yapın</Link></p>
    </form>
  );
}

export function LoginForm() {
  const { state, pending, onSubmit } = useFormAction(login, {} as AuthState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-posta"><Input name="email" type="email" defaultValue={state.values?.email} autoComplete="email" required /></Field>
      <Field label="Şifre"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Giriş yapılıyor…" : "Giriş yap"}</Button>
      <p className="text-center text-sm text-muted">Yeni misiniz? <Link href="/kayit" className="text-brand underline">İşletme hesabı açın</Link></p>
    </form>
  );
}
