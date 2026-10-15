"use client";
import { pairDevice, type KasaState } from "@/lib/kasa/actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

export function PairForm() {
  const { state, pending, onSubmit } = useFormAction(pairDevice, {} as KasaState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Eşleme kodu" hint="Yönetim > Cihazlar'da verilen 8 karakter"><Input name="code" autoFocus inputMode="text" autoComplete="off" autoCapitalize="characters" maxLength={8} onChange={(e) => { e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }} className="h-14 text-center font-mono text-2xl uppercase tracking-[0.3em]" required /></Field>
      {state.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? "Eşleniyor…" : "Eşle"}</Button>
    </form>
  );
}
