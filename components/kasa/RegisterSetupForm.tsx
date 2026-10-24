"use client";

import { useState } from "react";
import Link from "next/link";
import { setupOwnRegister, type SetupState } from "@/lib/kasa/setup-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function RegisterSetupForm({ name, paired }: { name: string; paired: boolean }) {
  const { state, pending, onSubmit } = useFormAction(setupOwnRegister, {} as SetupState);
  const [edited, setEdited] = useState(false);
  return <form onSubmit={event => { setEdited(false); onSubmit(event); }} onChangeCapture={() => setEdited(true)} className="space-y-4" aria-busy={pending}>
    <fieldset disabled={pending} className="m-0 min-w-0 space-y-4 border-0 p-0">
      <Field label="Kasada görünecek ad"><Input name="name" defaultValue={name} minLength={2} maxLength={60} required autoComplete="name" /></Field>
      {paired ? <input type="hidden" name="deviceName" value="Mevcut kasa" /> : <Field label="Bu kasanın adı"><Input name="deviceName" defaultValue="Kasa 1" minLength={2} maxLength={40} required /></Field>}
      <Field label="Kasa PIN’iniz" hint="4–6 rakam; aynı veya ardışık rakamları kullanmayın."><PasswordInput name="pin" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" required /></Field>
      <Field label="PIN’i tekrar girin"><PasswordInput name="confirmPin" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" required /></Field>
    </fieldset>
    {state.error && !pending && !edited && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    <p className="text-sm text-muted">Sonraki girişlerde bu PIN’i kullanın. PIN değişikliği: Yönetim → Personel → Düzenle. Değiştirirken hesap şifreniz sorulur.</p>
    <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Kuruluyor…" : "PIN’i kaydet ve kasayı aç"}</Button>
    <Link href="/yonetim/personel" className="block py-2 text-center text-sm text-brand underline">Mevcut personelin PIN’ini değiştir</Link>
  </form>;
}
