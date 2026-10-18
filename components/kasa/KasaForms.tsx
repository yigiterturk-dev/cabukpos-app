"use client";
import { useState } from "react";
import { pairDevice, type KasaState } from "@/lib/kasa/actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

export function PairForm() {
  const { state, pending, onSubmit } = useFormAction(pairDevice, {} as KasaState);
  const [edited, setEdited] = useState(false);
  const displayError = edited || pending ? undefined : state.error;
  return (
    <form onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="space-y-4">
      <Field label="Eşleme kodu" hint="Yönetim > Cihazlar'da verilen 8 karakter"><Input name="code" disabled={pending} autoFocus inputMode="text" autoComplete="off" autoCapitalize="characters" maxLength={8} onChange={(e) => { e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }} className="h-14 text-center font-mono text-2xl uppercase tracking-[0.3em]" required aria-invalid={!!displayError || undefined} aria-describedby={displayError ? "pair-code-error" : undefined} /></Field>
      {displayError && <p id="pair-code-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayError}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? "Eşleniyor…" : "Eşle"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Kasa cihazı eşleştiriliyor.</p>}
    </form>
  );
}
