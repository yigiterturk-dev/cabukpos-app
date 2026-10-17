"use client";

import { useEffect, useRef } from "react";
import { useFormAction } from "@/components/useFormAction";
import { buttonClass, Field, Input } from "@/components/ui";
import type { GiftCardState } from "@/lib/admin/loyalty-actions";

function GiftCardCreateFields({ unit, pending, state }: { unit: string; pending: boolean; state: GiftCardState }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        {state.error && <p id="gift-create-error" className="break-words text-sm text-bad sm:col-span-2 lg:col-span-4" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label={`Yüklenecek tutar (${unit})`} hint="1,00–50.000,00 arası"><Input name="initial" inputMode="decimal" required aria-invalid={state.field === "initial" || undefined} aria-describedby={state.field === "initial" ? "gift-create-error" : undefined} /></Field>
        <Field label="Kod" hint="Boş bırakılırsa HK-XXXXXX üretilir"><Input name="code" className="uppercase" aria-invalid={state.field === "code" || undefined} aria-describedby={state.field === "code" ? "gift-create-error" : undefined} /></Field>
        <Field label="Son kullanma" hint="Boş = süresiz"><Input name="expiresAt" type="date" aria-invalid={state.field === "expiresAt" || undefined} aria-describedby={state.field === "expiresAt" ? "gift-create-error" : undefined} /></Field>
        <Field label="Not"><Input name="note" /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Kart oluşturuluyor…" : "Kart oluştur"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Hediye kartı oluşturuluyor.</span>}
    </>
  );
}

export function GiftCardCreateForm({ action, unit }: { action: (state: GiftCardState, formData: FormData) => Promise<GiftCardState>; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as GiftCardState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return <form ref={formRef} onSubmit={onSubmit} aria-busy={pending}><GiftCardCreateFields unit={unit} pending={pending} state={state} /></form>;
}

function GiftCardLoadFields({ unit, pending, state }: { unit: string; pending: boolean; state: GiftCardState }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
        {state.error && <p id="gift-load-error" className="basis-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label={`Bakiye yükle (${unit})`} hint="0,01–50.000,00 arası"><Input name="amount" inputMode="decimal" className="w-32" required aria-invalid={state.field === "amount" || undefined} aria-describedby={state.field === "amount" ? "gift-load-error" : undefined} /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Yükleniyor…" : "Yükle"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Hediye kartı bakiyesi yükleniyor.</span>}
    </>
  );
}

export function GiftCardLoadForm({ action, cardId, unit }: { action: (state: GiftCardState, formData: FormData) => Promise<GiftCardState>; cardId: string; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as GiftCardState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="mb-4"><input type="hidden" name="cardId" value={cardId} /><GiftCardLoadFields unit={unit} pending={pending} state={state} /></form>;
}
