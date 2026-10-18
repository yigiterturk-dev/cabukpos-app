"use client";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
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
export function ReservationForm({ storeId, day, tables }: { storeId: string | null; day: string; tables: { id: string; name: string; areaName: string }[] }) {
  const { state, pending, onSubmit } = useFormAction(createReservation, {} as ResState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as ResState) : state;
  useEffect(() => {
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [state.error, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="storeId" value={storeId ?? ""} />
      <fieldset key={state.savedAt ?? 0} disabled={pending} aria-busy={pending} className="contents">
      <Field label="İsim" hint="1–120 karakter"><Input name="name" required maxLength={120} pattern=".*\S.*" autoComplete="name" {...errorProps(displayState, "name")} /></Field>
      <div><Field label="Telefon" hint="6–15 rakam; ülke koduyla da girebilirsiniz. Örn. 532 123 45 67 veya +90 532 123 45 67"><Input name="phone" type="tel" inputMode="tel" required maxLength={24} autoComplete="tel" placeholder="532 123 45 67" {...errorProps(displayState, "phone")} /></Field><Err state={displayState} field="phone" /></div>
      <div><Field label="Kişi" hint="1–99 kişi"><Input name="guests" type="number" inputMode="numeric" step={1} required min={1} max={99} defaultValue={2} className="!w-24" {...errorProps(displayState, "guests")} /></Field><Err state={displayState} field="guests" /></div>
      <div><Field label="Saat" hint="Rezervasyon Türkiye saatine göre kaydedilir."><Input name="time" type="time" required defaultValue="19:00" className="!w-32" {...errorProps(displayState, "time")} /></Field><Err state={displayState} field="time" /></div>
      {tables.length > 0 && (
        <Field label="Masa (opsiyonel)">
          <Select disabled={pending} name="tableId" defaultValue="" onChange={() => setEdited(true)} options={[{ value: "", label: "—" }, ...tables.map((t) => ({ value: t.id, label: `${t.areaName} · ${t.name}` }))]} />
        </Field>
      )}
      <div className="sm:col-span-2"><Field label="Not" hint="İsteğe bağlı · en fazla 300 karakter"><Textarea name="note" rows={2} maxLength={300} placeholder="ör. bebek sandalyesi" {...errorProps(displayState, "note")} /></Field><Err state={displayState} field="note" /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || !storeId}>{pending ? "Kaydediliyor…" : "Rezervasyon ekle"}</Button>
        {!storeId && <span className="text-sm text-muted">Rezervasyon eklemek için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</span>}
        {state.savedAt && !edited && !pending && !state.error ? <span className="shrink-0 text-sm text-ok" role="status">Eklendi.</span> : displayState.error && !displayState.field ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</span> : null}
      </div>
      <Err state={displayState} field="name" />
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

function StatusSubmit({ label, name, value, errorId, onClick }: { label: string; name: string; value: ResStatus; errorId?: string; onClick: (button: HTMLButtonElement) => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="status" value={value} disabled={pending} aria-busy={pending || undefined} aria-describedby={errorId} onClick={(event) => onClick(event.currentTarget)} aria-label={pending ? `${label} kaydediliyor: ${name}` : `${label}: ${name}`}
      className="press inline-flex min-h-11 items-center rounded-lg border border-line px-2.5 py-2 text-xs font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50">
      {pending ? "Kaydediliyor…" : label}
    </button>
  );
}

/** Durum düğmeleri — sunucu eylemi (form action). */
export function ResStatusButtons({ id, name, status }: { id: string; name: string; status: ResStatus }) {
  const [state, dispatch, pending] = useActionState(setReservationStatus, {} as ResState);
  const errorId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const lastActionRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (pending) return;
    if (state.error) {
      const frame = window.requestAnimationFrame(() => errorRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    const previous = lastActionRef.current;
    if (!previous) return;
    lastActionRef.current = null;
    if (previous.isConnected) return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const nextAction = regionRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      (nextAction ?? statusRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, status]);
  return (
    <div ref={regionRef} className="flex flex-wrap gap-1">
      {(NEXT[status] ?? []).length > 0 && <form action={dispatch} className="flex flex-wrap gap-1">
        <input type="hidden" name="id" value={id} />
        {(NEXT[status] ?? []).map(([s, label]) => <StatusSubmit key={s} label={label} name={name} value={s} errorId={state.error ? errorId : undefined} onClick={(button) => { lastActionRef.current = button; }} />)}
      </form>}
      {state.error && <p ref={errorRef} id={errorId} tabIndex={-1} className="basis-full break-words text-xs text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{state.error}</p>}
      {status !== "bekliyor" && <span ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="self-center text-xs text-muted outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{state.savedAt ? `Durum kaydedildi: ${RES_LABEL[status]}.` : RES_LABEL[status]}</span>}
    </div>
  );
}
