"use client";
import { useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { savePlanAction, statusPlanAction, type PlanState } from "@/lib/admin/staff-plan-actions";
import { PLAN_KINDS, PLAN_STATUSES } from "@/lib/core/staff-plan";
import { Button, Field, Input } from "@/components/ui";

const selectClass = "min-h-11 min-w-0 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60";
async function saveKeepingDraft(previous: PlanState, form: FormData) {
  const result = await savePlanAction(previous, form);
  // Only a successful save resets the form; validation errors retain the entered draft.
  return result.error ? { ...result, savedAt: previous.savedAt, nextId: previous.nextId } : result;
}
export type PlanInitial = { id: string; revision: number; staffId: string; kind: string; title: string; startsAt: string; endsAt: string; breakMinutes: number; note: string };
export function StaffPlanForm({ staff, creationId, day, initial }: { staff: { id: string; name: string; active: boolean }[]; creationId: string; day: string; initial?: PlanInitial }) {
  const { state, pending, onSubmit } = useFormAction(saveKeepingDraft, {} as PlanState);
  const [kind, setKind] = useState(initial?.kind ?? "vardiya");
  const [edited, setEdited] = useState(false);
  const error = !pending && !edited ? state.error : null;
  return <form key={`${initial?.id ?? "new"}:${state.savedAt ?? 0}`} onSubmit={e => { setEdited(false); onSubmit(e); }} onChange={() => setEdited(true)} aria-busy={pending} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="id" value={initial?.id ?? state.nextId ?? creationId} />
    <input type="hidden" name="revision" value={initial?.revision ?? ""} />
    <Field label="Plan türü"><select className={selectClass} name="kind" value={kind} disabled={pending} onChange={e => setKind(e.target.value)}>{Object.entries(PLAN_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Personel"><select className={selectClass} name="staffId" defaultValue={initial?.staffId ?? ""} required disabled={pending}><option value="" disabled>Personel seçin</option>{staff.filter(s => s.active || s.id === initial?.staffId).map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (pasif)"}</option>)}</select></Field>
    <div className="sm:col-span-2"><Field label="Başlık"><Input name="title" defaultValue={initial?.title ?? (kind === "vardiya" ? "Çalışma vardiyası" : "")} required minLength={2} maxLength={120} disabled={pending} /></Field></div>
    <Field label="Başlangıç"><Input name="startsAt" type="datetime-local" defaultValue={initial?.startsAt ?? `${day}T09:00`} required disabled={pending} /></Field>
    <Field label="Bitiş"><Input name="endsAt" type="datetime-local" defaultValue={initial?.endsAt ?? `${day}T17:00`} required disabled={pending} /></Field>
    {kind === "vardiya" && <Field label="Mola (dakika)" hint="Mola çalışma süresinden düşülür."><Input type="number" inputMode="numeric" name="breakMinutes" min={0} max={720} defaultValue={initial?.breakMinutes ?? 30} required disabled={pending} /></Field>}
    <div className="sm:col-span-2"><Field label="Açıklama / görev notu"><textarea className={`${selectClass} min-h-24 py-3`} name="note" defaultValue={initial?.note ?? ""} maxLength={1000} disabled={pending} /></Field></div>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={pending || !staff.some(s => s.active)}>{pending ? "Kaydediliyor…" : initial ? "Değişiklikleri kaydet" : "Plana ekle"}</Button>{pending && <span role="status" className="text-sm text-muted">Personel planı kaydediliyor.</span>}{error && <p role="alert" className="text-sm text-bad">{error}</p>}{state.savedAt && !error && !pending && !edited && <p role="status" className="text-sm text-ok">Plan kaydedildi.</p>}</div>
    <p className="text-xs text-muted sm:col-span-2">Saatler Türkiye saatidir. Gece vardiyasında bitiş için ertesi günü seçin. Bu plan kasa vardiyası açmaz; puantaj veya ücret hesabı oluşturmaz.</p>
  </form>;
}

export function StaffPlanStatusForm({ id, revision, status, title }: { id: string; revision: number; status: string; title: string }) {
  const { state, pending, onSubmit } = useFormAction(statusPlanAction, {} as PlanState);
  const [edited, setEdited] = useState(false);
  return <form onSubmit={e => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="mt-3 flex flex-wrap items-center gap-2">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} />
    <select name="status" defaultValue={status} disabled={pending} onChange={() => setEdited(true)} aria-label={`Durum: ${title}`} className={`${selectClass} flex-1`}>{Object.entries(PLAN_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Uygula"}</Button>
    {!pending && !edited && state.error && <p role="alert" className="basis-full text-sm text-bad">{state.error}</p>}
  </form>;
}
