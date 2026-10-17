"use client";

import { useEffect, useRef } from "react";
import { useFormAction } from "@/components/useFormAction";
import { buttonClass } from "@/components/ui";
import type { CampaignDraftState } from "@/lib/admin/growth-actions";

export function CampaignDraftForm({ action, segment }: {
  action: (state: CampaignDraftState, formData: FormData) => Promise<CampaignDraftState>;
  segment: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action, {} as CampaignDraftState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="grid gap-3 content-start md:grid-cols-[1fr_2fr_auto] lg:grid-cols-1">
      <input type="hidden" name="segment" value={segment} />
      {state.error && <p id="campaign-draft-error" className="break-words text-sm text-bad md:col-span-3 lg:col-span-1" role="alert" aria-live="assertive">{state.error}</p>}
      <fieldset disabled={pending} aria-busy={pending} className="contents">
        <label className="text-sm"><span className="mb-1.5 block font-medium">Kampanya adı</span><input name="name" required minLength={2} maxLength={80} placeholder="30 gün geri kazanım" aria-invalid={state.field === "name" || undefined} aria-describedby={state.field === "name" && state.error ? "campaign-draft-error" : undefined} className="min-h-11 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
        <label className="text-sm"><span className="mb-1.5 block font-medium">Mesaj taslağı</span><input name="message" required minLength={5} maxLength={500} placeholder="Sizi özledik…" aria-invalid={state.field === "message" || undefined} aria-describedby={state.field === "message" && state.error ? "campaign-draft-error" : undefined} className="min-h-11 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Taslak kaydediliyor…" : "Taslağı kaydet"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Kampanya taslağı kaydediliyor.</span>}
    </form>
  );
}
