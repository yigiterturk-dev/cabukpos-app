"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Select } from "@/components/Select";
import { buttonClass, Field, Input } from "@/components/ui";
import { useFormAction } from "@/components/useFormAction";
import type { RefundRequestState } from "@/lib/billing/actions";

function RefundRequestFields({ compact, hint, pending, state, errorId, onEdit }: { compact: boolean; hint: boolean | null; pending: boolean; state: RefundRequestState; errorId: string; onEdit: () => void }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className={`m-0 min-w-0 border-0 p-0 ${compact ? "space-y-3" : "flex flex-wrap items-end gap-3"}`}>
        {state.error && <p id={errorId} className="basis-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label="İade talebi nedeni">
          <Select disabled={pending} name="reason" defaultValue="satissiz" options={[
            { value: "satissiz", label: "7 gün içinde satışsız dönem" },
            { value: "hatali", label: "Hatalı / mükerrer çekim" },
            { value: "diger", label: "Diğer" },
          ]} onChange={onEdit} aria-invalid={state.field === "reason" || undefined} aria-describedby={state.field === "reason" ? errorId : undefined} />
        </Field>
        <Field label="Not" hint="İsteğe bağlı · en fazla 300 karakter"><Input name="note" maxLength={300} className={compact ? undefined : "w-64"} /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>
          {pending ? "Gönderiliyor…" : "Talebi gönder"}
        </button>
        <span className={`text-xs text-muted ${compact ? "block" : ""}`}>
          {hint === true ? "Koşula uygun görünüyor: ödeme 7 gün içinde ve dönemde satış yok → tam iade istenebilir." : hint === false ? "Yayınlanan koşula göre başlamış dönemin bedeli iade edilmez; yalnız hatalı/mükerrer çekimde tam iade istenebilir." : ""}
        </span>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">İade talebi gönderiliyor.</span>}
    </>
  );
}

export function RefundRequestForm({ action, paymentId, hint, compact = false }: {
  action: (state: RefundRequestState, formData: FormData) => Promise<RefundRequestState>;
  paymentId: string;
  hint: boolean | null;
  compact?: boolean;
}) {
  const errorId = useId();
  const { state, pending, onSubmit } = useFormAction(action, {} as RefundRequestState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as RefundRequestState) : state;
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className={compact ? "space-y-3 rounded-xl bg-surface-2 p-3" : "flex flex-wrap items-end gap-3"}>
      <input type="hidden" name="id" value={paymentId} />
      <RefundRequestFields compact={compact} hint={hint} pending={pending} state={displayState} errorId={errorId} onEdit={() => setEdited(true)} />
    </form>
  );
}

function RefundStatusSubmit({ label, ariaLabel, className }: { label: string; ariaLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" aria-label={pending ? `${ariaLabel} işleniyor` : ariaLabel} disabled={pending} aria-busy={pending || undefined} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
        {pending ? "İşleniyor…" : label}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">{ariaLabel} işleniyor.</span>}
    </>
  );
}

export function RefundStatusForm({ action, paymentId, label, ariaLabel, className }: {
  action: (formData: FormData) => void | Promise<void>;
  paymentId: string;
  label: string;
  ariaLabel: string;
  className: string;
}) {
  return <form action={action}><input type="hidden" name="id" value={paymentId} /><RefundStatusSubmit label={label} ariaLabel={ariaLabel} className={className} /></form>;
}
