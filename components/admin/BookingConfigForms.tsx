"use client";
import { useFormAction } from "@/components/useFormAction";
import { saveBookingConfig, saveTableCapacity, type BookingConfigState } from "@/lib/admin/reservation-settings-actions";
import { Button, Field, Input } from "@/components/ui";
type Config = { enabled: boolean; openMinute: number; closeMinute: number; durationMinutes: number; slotMinutes: number; advanceDays: number };
const Result = ({ state }: { state: BookingConfigState }) => state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : state.savedAt ? <p role="status" className="text-sm text-ok">Kaydedildi.</p> : null;
export function BookingConfigForm({ config }: { config: Config }) {
  const { state, pending, onSubmit } = useFormAction(saveBookingConfig, {} as BookingConfigState);
  const hm = (m: number) => `${String(Math.floor(m % 1440 / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
    <label className="flex min-h-11 items-center gap-2 sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={config.enabled} disabled={pending} />Müşteriden çevrimiçi rezervasyon al</label>
    <Field label="İlk rezervasyon saati"><Input type="time" name="openTime" defaultValue={hm(config.openMinute)} required disabled={pending} /></Field>
    <Field label="Kapanış saati" hint="00:00 seçerseniz gece yarısına kadar."><Input type="time" name="closeTime" defaultValue={hm(config.closeMinute)} required disabled={pending} /></Field>
    <Field label="Rezervasyon süresi (dakika)"><Input name="durationMinutes" type="number" min={15} max={360} defaultValue={config.durationMinutes} required disabled={pending} /></Field>
    <Field label="Saatler arasındaki aralık"><select className="min-h-11 rounded-xl border border-line bg-surface px-3" name="slotMinutes" defaultValue={config.slotMinutes} disabled={pending}>{[15,30,60].map(v => <option value={v} key={v}>{v} dakika</option>)}</select></Field>
    <Field label="En fazla kaç gün sonrası?"><Input name="advanceDays" type="number" min={1} max={90} defaultValue={config.advanceDays} required disabled={pending} /></Field>
    <p className="text-xs text-muted sm:col-span-2">Saatler Türkiye saatidir. Talep beklerken masa ayrılır; iptal veya gelmedi durumunda boşalır. Açmadan önce masa kapasitelerini kontrol edin.</p>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Rezervasyon ayarlarını kaydet"}</Button>{!pending && <Result state={state} />}</div>
  </form>;
}
export function TableCapacityForm({ id, name, seats }: { id: string; name: string; seats: number }) {
  const { state, pending, onSubmit } = useFormAction(saveTableCapacity, {} as BookingConfigState);
  return <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={id} /><div className="w-28"><Field label="Kişi kapasitesi"><Input aria-label={`Kapasite: ${name}`} type="number" min={0} max={99} name="seats" defaultValue={seats} required disabled={pending} /></Field></div><Button type="submit" variant="secondary" disabled={pending}>Kaydet</Button>{!pending && <Result state={state} />}</form>;
}
