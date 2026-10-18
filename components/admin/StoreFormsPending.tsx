"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, Field, Input } from "@/components/ui";
import { useFormAction } from "@/components/useFormAction";
import type { StoreFormState } from "@/lib/admin/store-actions";

type StoreAction = (state: StoreFormState, formData: FormData) => Promise<StoreFormState>;
type SwitchAction = (formData: FormData) => void | Promise<void>;

function Submit({ label, pendingLabel, pending }: { label: string; pendingLabel: string; pending: boolean }) {
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>
        {pending ? pendingLabel : label}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">{pendingLabel}</span>}
    </>
  );
}

function CreateFields({ state, pending }: { state: StoreFormState; pending: boolean }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
        <Field label="Şube adı" hint="2–80 karakter"><Input name="name" minLength={2} maxLength={80} pattern=".*\S.*\S.*" className="w-56" required aria-invalid={state.field === "name" || undefined} aria-describedby={state.field === "name" ? "store-create-name-error" : undefined} /></Field>
        <Field label="Adres" hint="İsteğe bağlı · en fazla 300 karakter"><Input name="address" maxLength={300} className="w-72" /></Field>
        <Submit label="Şube oluştur" pendingLabel="Şube oluşturuluyor…" pending={pending} />
      </fieldset>
    </>
  );
}

export function StoreCreateForm({ action }: { action: StoreAction }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as StoreFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as StoreFormState) : state;
  useEffect(() => { if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }, [state.error, state.field]);
  return <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending}>
    {displayState.error && <p id="store-create-name-error" className="mb-3 break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
    <CreateFields state={displayState} pending={pending} />
  </form>;
}

function UpdateFields({ name, address, state, storeId, pending }: { name: string; address: string; state: StoreFormState; storeId: string; pending: boolean }) {
  return (
    <fieldset disabled={pending} aria-busy={pending} className="m-0 flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
      <Field label="Ad" hint="2–80 karakter"><Input name="name" minLength={2} maxLength={80} pattern=".*\S.*\S.*" defaultValue={name} className="w-56" required aria-invalid={state.field === "name" || undefined} aria-describedby={state.field === "name" ? `store-${storeId}-name-error` : undefined} /></Field>
      <Field label="Adres" hint="İsteğe bağlı · en fazla 300 karakter"><Input name="address" maxLength={300} defaultValue={address} className="w-72" /></Field>
      <Submit label="Kaydet" pendingLabel="Kaydediliyor…" pending={pending} />
    </fieldset>
  );
}

export function StoreUpdateForm({ action, storeId, name, address }: { action: StoreAction; storeId: string; name: string; address: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as StoreFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as StoreFormState) : state;
  useEffect(() => { if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }, [state.error, state.field]);
  return <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="mt-3 flex flex-wrap items-end gap-3"><input type="hidden" name="storeId" value={storeId} />
    {displayState.error && <p id={`store-${storeId}-name-error`} className="basis-full break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
    <UpdateFields name={name} address={address} state={displayState} storeId={storeId} pending={pending} />
  </form>;
}

function SwitchSubmit() {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Geçiliyor…" : "Bu şubeye geç"}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Şubeye geçiliyor.</span>}
    </>
  );
}

export function StoreSwitchForm({ action, storeId }: { action: SwitchAction; storeId: string }) {
  return <form action={action} className="ml-auto shrink-0"><input type="hidden" name="storeId" value={storeId} /><SwitchSubmit /></form>;
}
