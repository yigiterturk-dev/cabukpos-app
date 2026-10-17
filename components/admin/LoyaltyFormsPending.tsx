"use client";

import { useEffect, useRef } from "react";
import { useFormAction } from "@/components/useFormAction";
import { formatPlain } from "@/lib/core/money";
import { buttonClass, Field, Input } from "@/components/ui";
import type { LoyaltyFormState } from "@/lib/admin/loyalty-actions";

type LoyaltySettings = { enabled: boolean; kurusPerPoint: number | null; kurusPerRedeem: number | null; minRedeemPoints: number | null } | null;

function SettingsFields({ settings, unit, pending, state }: { settings: LoyaltySettings; unit: string; pending: boolean; state: LoyaltyFormState }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        {state.error && <p id="loyalty-settings-error" className="break-words text-sm text-bad sm:col-span-2 lg:col-span-4" role="alert" aria-live="assertive">{state.error}</p>}
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-4">
          <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} className="size-4 accent-brand" />
          Puan programı açık
        </label>
        <Field label={`1 puan için gereken harcama (${unit})`} hint="Her bu kadar harcamaya 1 puan"><Input name="kurusPerPoint" inputMode="decimal" defaultValue={settings?.kurusPerPoint != null ? formatPlain(settings.kurusPerPoint) : "100,00"} required aria-invalid={state.field === "kurusPerPoint" || undefined} aria-describedby={state.field === "kurusPerPoint" ? "loyalty-settings-error" : undefined} /></Field>
        <Field label={`1 puanın indirimi (${unit})`} hint="Puan başına düşülecek tutar"><Input name="kurusPerRedeem" inputMode="decimal" defaultValue={settings?.kurusPerRedeem != null ? formatPlain(settings.kurusPerRedeem) : "1,00"} required aria-invalid={state.field === "kurusPerRedeem" || undefined} aria-describedby={state.field === "kurusPerRedeem" ? "loyalty-settings-error" : undefined} /></Field>
        <Field label="En az harcanabilir puan" hint="Bu puanın altında indirim yapılmaz"><Input name="minRedeemPoints" type="number" step={1} min={0} max={1000000} defaultValue={settings?.minRedeemPoints ?? 10} required aria-invalid={state.field === "minRedeemPoints" || undefined} aria-describedby={state.field === "minRedeemPoints" ? "loyalty-settings-error" : undefined} /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Kaydediliyor…" : "Ayarları kaydet"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Sadakat programı ayarları kaydediliyor.</span>}
    </>
  );
}

export function LoyaltySettingsForm({ action, settings, unit }: { action: (state: LoyaltyFormState, formData: FormData) => Promise<LoyaltyFormState>; settings: LoyaltySettings; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as LoyaltyFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }, [state.error, state.field]);
  return <form ref={formRef} onSubmit={onSubmit} aria-busy={pending}><SettingsFields settings={settings} unit={unit} pending={pending} state={state} /></form>;
}

function PointsFields({ pending, state }: { pending: boolean; state: LoyaltyFormState }) {
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
        {state.error && <p id="loyalty-points-error" className="basis-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label="Puan ekle / düş (− ile)"><Input name="points" type="number" step={1} min={-100000} max={100000} className="w-32" required aria-invalid={state.field === "points" || undefined} aria-describedby={state.field === "points" ? "loyalty-points-error" : undefined} /></Field>
        <Field label="Not"><Input name="note" className="w-64" /></Field>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Uygulanıyor…" : "Uygula"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Müşteri puan düzeltmesi uygulanıyor.</span>}
    </>
  );
}

export function PointsAdjustForm({ action, customerId }: { action: (state: LoyaltyFormState, formData: FormData) => Promise<LoyaltyFormState>; customerId: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as LoyaltyFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }, [state.error, state.field]);
  return <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="mb-4"><input type="hidden" name="customerId" value={customerId} /><PointsFields pending={pending} state={state} /></form>;
}
