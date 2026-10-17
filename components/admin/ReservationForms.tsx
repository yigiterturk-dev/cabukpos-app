"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Select } from "@/components/Select";
import { createReservation, setReservationStatus, type ResState } from "@/lib/admin/reservation-actions";
import { RES_LABEL, type ResStatus } from "@/lib/core/reservation";

const Err = ({ state, field }: { state: ResState; field: string }) => state.field === field && state.error
  ? <p id={`reservation-${field}-error`} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>
  : null;
const errorProps = (state: ResState, field: string) => state.field === field && state.error
  ? { "aria-invalid": true as const, "aria-describedby": `reservation-${field}-error` }
  : {};

/** Yeni rezervasyon formu. */
export function ReservationForm({ storeId, day, tables }: { storeId: string | null; day: string; tables: { id: string; name: string; storeId: string }[] }) {
  const { state, pending, onSubmit } = useFormAction(createReservation, {} as ResState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [state.error, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="storeId" value={storeId ?? ""} />
      <fieldset key={state.savedAt ?? 0} disabled={pending} aria-busy={pending} className="contents">
      <Field label="İsim"><Input name="name" required maxLength={120} autoComplete="name" {...errorProps(state, "name")} /></Field>
      <div><Field label="Telefon" hint="6–15 rakam; ülke koduyla da girebilirsiniz. Örn. 532 123 45 67 veya +90 532 123 45 67"><Input name="phone" type="tel" inputMode="tel" required maxLength={24} autoComplete="tel" placeholder="532 123 45 67" {...errorProps(state, "phone")} /></Field><Err state={state} field="phone" /></div>
      <div><Field label="Kişi"><Input name="guests" inputMode="numeric" required min={1} max={99} defaultValue={2} className="!w-24" {...errorProps(state, "guests")} /></Field><Err state={state} field="guests" /></div>
      <div><Field label="Saat"><Input name="time" type="time" required defaultValue="19:00" className="!w-32" {...errorProps(state, "time")} /></Field><Err state={state} field="time" /></div>
      {tables.length > 0 && (
        <Field label="Masa (opsiyonel)">
          <Select disabled={pending} name="tableId" defaultValue="" options={[{ value: "", label: "—" }, ...tables.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
      )}
      <div className="sm:col-span-2"><Field label="Not"><Textarea name="note" rows={2} maxLength={300} placeholder="ör. bebek sandalyesi" {...errorProps(state, "note")} /></Field><Err state={state} field="note" /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || !storeId}>{pending ? "Kaydediliyor…" : "Rezervasyon ekle"}</Button>
        {!storeId && <span className="text-sm text-muted">Rezervasyon eklemek için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</span>}
        {state.savedAt ? <span className="shrink-0 text-sm text-ok" role="status">Eklendi.</span> : state.error && !state.field ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : null}
      </div>
      <Err state={state} field="name" />
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Rezervasyon kaydediliyor.</span>}
    </form>
  );
}

const NEXT: Record<string, [ResStatus, string][]> = {
  bekliyor: [["onaylandi", "Onayla"], ["iptal", "İptal"]],
  onaylandi: [["geldi", "Geldi"], ["gelmedi", "Gelmedi"], ["iptal", "İptal"]],
  geldi: [], gelmedi: [], iptal: [["onaylandi", "Geri al"]],
};

function StatusSubmit({ label, name, value }: { label: string; name: string; value: ResStatus }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="status" value={value} disabled={pending} aria-busy={pending || undefined} aria-label={pending ? `${label} kaydediliyor: ${name}` : `${label}: ${name}`}
      className="press inline-flex min-h-11 items-center rounded-lg border border-line px-2.5 py-2 text-xs font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50">
      {pending ? "Kaydediliyor…" : label}
    </button>
  );
}

/** Durum düğmeleri — sunucu eylemi (form action). */
export function ResStatusButtons({ id, name, status }: { id: string; name: string; status: ResStatus }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(NEXT[status] ?? []).length > 0 && <form action={setReservationStatus} className="flex flex-wrap gap-1">
        <input type="hidden" name="id" value={id} />
        {(NEXT[status] ?? []).map(([s, label]) => <StatusSubmit key={s} label={label} name={name} value={s} />)}
      </form>}
      {status !== "bekliyor" && <span className="self-center text-xs text-muted">{RES_LABEL[status]}</span>}
    </div>
  );
}
