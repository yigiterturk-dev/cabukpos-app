"use client";

import { useState } from "react";
import Link from "next/link";
import { setupOwnRegister, type SetupState } from "@/lib/kasa/setup-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { inspectRegisterSwitch } from "@/lib/offline/register-switch";

export function RegisterSetupForm({ name, paired, pairedDeviceId }: { name: string; paired: boolean; pairedDeviceId: string | null }) {
  const submit = async (state: SetupState, form: FormData): Promise<SetupState> => {
    try {
      const problem = await inspectRegisterSwitch(pairedDeviceId);
      if (problem) return { error: problem };
    } catch { return { error: "Yerel kasa durumu kontrol edilemedi. Veri silinmedi; yeniden deneyin." }; }
    return setupOwnRegister(state, form);
  };
  const { state, pending, onSubmit } = useFormAction(submit, {} as SetupState);
  const [edited, setEdited] = useState(false);
  return <form onSubmit={event => { setEdited(false); onSubmit(event); }} onChangeCapture={() => setEdited(true)} className="space-y-4" aria-busy={pending}>
    <fieldset disabled={pending} className="m-0 min-w-0 space-y-4 border-0 p-0">
      <Field label="Kasada görünecek ad"><Input name="name" defaultValue={name} minLength={2} maxLength={60} required autoComplete="name" /></Field>
      {paired ? <input type="hidden" name="deviceName" value="Mevcut kasa" /> : <Field label="Bu kasanın adı"><Input name="deviceName" defaultValue="Kasa 1" minLength={2} maxLength={40} required /></Field>}
      <Field label="Kasa PIN’i (isteğe bağlı)" hint="Boş bırakırsan kasada adına dokunarak girersin. Koyacaksan 4–6 rakam."><PasswordInput name="pin" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" /></Field>
      <Field label="PIN’i tekrar girin"><PasswordInput name="confirmPin" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" /></Field>
    </fieldset>
    {state.error && !pending && !edited && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    <p className="text-sm text-muted">PIN sonradan Yönetim → Personel’den eklenebilir veya kaldırılabilir.</p>
    <Button type="submit" disabled={pending} size="lg" className="w-full">{pending ? "Kuruluyor…" : "Kasayı aç"}</Button>
    <Link href="/yonetim/personel" className="block py-2 text-center text-sm text-brand underline">Mevcut personelin PIN’ini değiştir</Link>
  </form>;
}
