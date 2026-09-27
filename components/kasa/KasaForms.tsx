"use client";
import { useActionState, useState } from "react";
import { closeShiftAction, openShiftAction, pairDevice, pinLogin, type KasaState } from "@/lib/kasa/actions";
import { Button, Field, Input } from "@/components/ui";

export function PairForm() {
  const [state, action, pending] = useActionState<KasaState, FormData>(pairDevice, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Eşleme kodu" hint="Yönetim > Cihazlar'da verilen 8 karakter"><Input name="code" autoComplete="off" autoCapitalize="characters" maxLength={9} className="font-mono text-lg uppercase tracking-widest" required /></Field>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Eşleniyor…" : "Eşle"}</Button>
    </form>
  );
}

export function PinPad() {
  const [state, action, pending] = useActionState<KasaState, FormData>(pinLogin, {});
  const [pin, setPin] = useState("");
  const key = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));
  return (
    <form action={(f) => { setPin(""); action(f); }} className="mx-auto w-full max-w-xs">
      <input type="hidden" name="pin" value={pin} />
      <div className="mb-4 flex h-12 items-center justify-center gap-3" aria-label="Girilen PIN">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={`size-3.5 rounded-full ${i < pin.length ? "bg-ink" : "border-2 border-line"}`} />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => key(d)} className="h-16 rounded-xl border border-line text-2xl font-medium hover:bg-stone-50 active:bg-stone-100">{d}</button>
        ))}
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 rounded-xl text-sm text-muted hover:bg-stone-50">Sil</button>
        <button type="button" onClick={() => key("0")} className="h-16 rounded-xl border border-line text-2xl font-medium hover:bg-stone-50 active:bg-stone-100">0</button>
        <button type="submit" disabled={pending || pin.length < 4} className="h-16 rounded-xl bg-brand text-lg font-medium text-white disabled:opacity-40">Gir</button>
      </div>
      {state.error && <p className="mt-4 text-center text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

export function OpenShiftForm() {
  const [state, action, pending] = useActionState<KasaState, FormData>(openShiftAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Kasadaki açılış nakdi (TL)"><Input name="openingCash" inputMode="decimal" defaultValue="0" className="text-lg" required /></Field>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">Vardiyayı aç</Button>
    </form>
  );
}

export function CloseShiftForm() {
  const [state, action, pending] = useActionState<KasaState, FormData>(closeShiftAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Sayılan nakit (TL)" hint="Kasadaki nakdi sayıp girin; fark beklenen kasaya göre hesaplanır."><Input name="countedCash" inputMode="decimal" className="text-lg" required /></Field>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Kapatılıyor…" : "Gün sonunu kapat"}</Button>
    </form>
  );
}
