"use client";
import { useActionState } from "react";
import { pairDevice, type KasaState } from "@/lib/kasa/actions";
import { Button, Field, Input } from "@/components/ui";

export function PairForm() {
  const [state, action, pending] = useActionState<KasaState, FormData>(pairDevice, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Eşleme kodu" hint="Yönetim > Cihazlar'da verilen 8 karakter"><Input name="code" autoComplete="off" autoCapitalize="characters" maxLength={9} className="h-14 text-center font-mono text-2xl uppercase tracking-[0.3em]" required /></Field>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? "Eşleniyor…" : "Eşle"}</Button>
    </form>
  );
}
