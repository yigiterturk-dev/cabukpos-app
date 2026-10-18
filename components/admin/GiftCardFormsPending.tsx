"use client";

import { useEffect, useRef, useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { buttonClass, Field, Input } from "@/components/ui";
import type { GiftCardState } from "@/lib/admin/loyalty-actions";

function GiftCardCreateFields({ unit, pending, state, today }: { unit: string; pending: boolean; state: GiftCardState; today: string }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        {state.error && <p id="gift-create-error" className="break-words text-sm text-bad sm:col-span-2 lg:col-span-4" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label={`Yüklenecek tutar (${unit})`} hint="1,00–50.000,00 arası · en çok 2 ondalık"><Input name="initial" inputMode="decimal" maxLength={9} required aria-invalid={state.field === "initial" || undefined} aria-describedby={state.field === "initial" ? "gift-create-error" : undefined} /></Field>
        <Field label="Kod" hint="İsteğe bağlı · normalize edilince 3–24 harf/rakam; boşluk ve tireler yok sayılır. En çok 48 karakter girilebilir; boş bırakırsan otomatik üretilir."><Input name="code" className="uppercase" minLength={3} maxLength={48} pattern="[- ]*[A-Za-z0-9]([- ]*[A-Za-z0-9]){2,23}[- ]*" aria-invalid={state.field === "code" || undefined} aria-describedby={state.field === "code" ? "gift-create-error" : undefined} /></Field>
        <Field label="Son kullanma" hint="Seçilen gün sonuna kadar geçerli; boş = süresiz"><Input name="expiresAt" type="date" min={today} aria-invalid={state.field === "expiresAt" || undefined} aria-describedby={state.field === "expiresAt" ? "gift-create-error" : undefined} /></Field>
        <Field label="Not" hint="İsteğe bağlı · en fazla 200 karakter"><Input name="note" maxLength={200} /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Kart oluşturuluyor…" : "Kart oluştur"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Hediye kartı oluşturuluyor.</span>}
    </>
  );
}

export function GiftCardCreateForm({ action, unit, today }: { action: (state: GiftCardState, formData: FormData) => Promise<GiftCardState>; unit: string; today: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as GiftCardState);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as GiftCardState) : state;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending}><GiftCardCreateFields unit={unit} pending={pending} state={displayState} today={today} /></form>;
}

function GiftCardLoadFields({ unit, pending, state }: { unit: string; pending: boolean; state: GiftCardState }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
        {state.error && <p id="gift-load-error" className="basis-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label={`Bakiye yükle (${unit})`} hint="0,01–50.000,00 arası · en çok 2 ondalık"><Input name="amount" inputMode="decimal" maxLength={9} className="w-32" required aria-invalid={state.field === "amount" || undefined} aria-describedby={state.field === "amount" ? "gift-load-error" : undefined} /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Yükleniyor…" : "Yükle"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Hediye kartı bakiyesi yükleniyor.</span>}
    </>
  );
}

export function GiftCardLoadForm({ action, cardId, unit }: { action: (state: GiftCardState, formData: FormData) => Promise<GiftCardState>; cardId: string; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as GiftCardState);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as GiftCardState) : state;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="mb-4"><input type="hidden" name="cardId" value={cardId} /><GiftCardLoadFields unit={unit} pending={pending} state={displayState} /></form>;
}
