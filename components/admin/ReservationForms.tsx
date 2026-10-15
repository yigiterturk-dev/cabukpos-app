"use client";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Select } from "@/components/Select";
import { createReservation, setReservationStatus, type ResState } from "@/lib/admin/reservation-actions";
import { RES_LABEL, type ResStatus } from "@/lib/core/reservation";

/** Yeni rezervasyon formu. */
export function ReservationForm({ stores, day, tables }: { stores: { id: string; name: string }[]; day: string; tables: { id: string; name: string; storeId: string }[] }) {
  const { state, pending, onSubmit } = useFormAction(createReservation, {} as ResState);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="storeId" value={stores[0]?.id ?? ""} />
      <Field label="İsim"><Input name="name" required maxLength={120} autoComplete="off" /></Field>
      <Field label="Telefon" hint="Başında 0 olmadan"><Input name="phone" inputMode="numeric" required maxLength={15} autoComplete="off" /></Field>
      <Field label="Kişi"><Input name="guests" inputMode="numeric" required min={1} max={99} defaultValue={2} className="!w-24" /></Field>
      <Field label="Saat"><Input name="time" type="time" required defaultValue="19:00" className="!w-32" /></Field>
      {tables.length > 0 && (
        <Field label="Masa (opsiyonel)">
          <Select name="tableId" defaultValue="" options={[{ value: "", label: "—" }, ...tables.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
      )}
      <div className="sm:col-span-2"><Field label="Not"><Textarea name="note" rows={2} maxLength={300} placeholder="ör. bebek sandalyesi" /></Field></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || !stores.length}>{pending ? "Kaydediliyor…" : "Rezervasyon ekle"}</Button>
        {state.savedAt ? <span className="shrink-0 text-sm text-ok" role="status">Eklendi.</span> : state.error ? <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span> : null}
      </div>
    </form>
  );
}

const NEXT: Record<string, [ResStatus, string][]> = {
  bekliyor: [["onaylandi", "Onayla"], ["iptal", "İptal"]],
  onaylandi: [["geldi", "Geldi"], ["gelmedi", "Gelmedi"], ["iptal", "İptal"]],
  geldi: [], gelmedi: [], iptal: [["onaylandi", "Geri al"]],
};

/** Durum düğmeleri — sunucu eylemi (form action). */
export function ResStatusButtons({ id, status }: { id: string; status: ResStatus }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(NEXT[status] ?? []).map(([s, label]) => (
        <form key={s} action={setReservationStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={s} />
        <button type="submit" className="press inline-flex min-h-11 items-center rounded-lg border border-line px-2.5 py-2 text-xs font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">{label}</button>
        </form>
      ))}
      {status !== "bekliyor" && <span className="self-center text-xs text-muted">{RES_LABEL[status]}</span>}
    </div>
  );
}
