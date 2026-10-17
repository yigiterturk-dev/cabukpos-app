"use client";
// M5 salon yönetim formları: bölge, masa, istasyon, seçenek grubu, cihaz rolü, kategori istasyonu.
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { addTables, salonSetup, saveArea, saveOptionGroup, saveStation, setCategoryStation, setDeviceRole, type SalonState } from "@/lib/admin/salon-actions";
import { formatTL } from "@/lib/core/money";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const Err = ({ s, f, id }: { s: SalonState; f?: string; id?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p id={f ? id ?? `salon-${f}-error` : undefined} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: SalonState, f: string) => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `salon-${f}-error` }
  : {};
const Saved = ({ s }: { s: SalonState }) => (s.savedAt ? <span className="text-sm text-ok" role="status">Kaydedildi.</span> : null);

export function AreaForm() {
  const { state, pending, onSubmit } = useFormAction(saveArea, {} as SalonState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="name" disabled={pending} placeholder="Yeni bölge (ör. Salon, Bahçe)" aria-label="Bölge adı" className="w-64" required {...errorProps(state, "name")} /><Err s={state} f="name" /></div>
      <Button type="submit" disabled={pending}>{pending ? "Ekleniyor…" : "Bölge ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Salon bölgesi ekleniyor.</span>}
    </form>
  );
}

const ONEMLI_BOLGELER = ["Salon", "Bahçe", "Teras", "Kapalı alan", "Üst kat"] as const;

/** İlk kurulum: bölge adı + masa sayısıyla salonu tek seferde kurar. */
export function SalonSetup() {
  const { state, pending, onSubmit } = useFormAction(salonSetup, {} as SalonState);
  const formRef = useRef<HTMLFormElement>(null);
  const addZoneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  const [rows, setRows] = useState([
    { name: "Salon", count: "8" },
    { name: "Bahçe", count: "4" },
  ]);
  const duzenle = (i: number, yama: Partial<{ name: string; count: string }>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...yama } : r)));
  return (
    <form ref={formRef} onSubmit={onSubmit} className="max-w-xl space-y-3">
      <p className="text-sm text-muted">Bölümlerini yaz, masa sayısını gir — masa planı kasaya ve garson tabletine otomatik düşer. Masa adları bölümün baş harfine göre verilir (S1…, B1…).</p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1"><Input name="zone" disabled={pending} value={r.name} onChange={(e) => duzenle(i, { name: e.target.value })} placeholder="Bölge adı (Salon, Bahçe, Teras…)" aria-label={`${i + 1}. bölge adı`} maxLength={40} {...errorProps(state, "zone")} /></div>
          <div className="w-28"><Input name="count" disabled={pending} value={r.count} onChange={(e) => duzenle(i, { count: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Masa" aria-label={`${i + 1}. bölge masa sayısı`} {...errorProps(state, "count")} /></div>
          <button type="button" disabled={pending} onClick={() => { setRows((rs) => rs.filter((_, k) => k !== i)); requestAnimationFrame(() => addZoneRef.current?.focus()); }} aria-label={`${r.name} bölümünü kaldır`}
            className={`flex size-11 items-center justify-center rounded-lg border border-line text-muted outline-none hover:text-bad focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${rows.length === 1 ? "invisible" : ""}`}>×</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted">Hızlı ekle:</span>
        {ONEMLI_BOLGELER.map((b, i) => (
          <button key={b} ref={i === 0 ? addZoneRef : undefined} type="button" disabled={pending} onClick={() => setRows((rs) => [...rs, { name: b, count: "4" }])}
            className="min-h-11 rounded-full border border-line px-3 py-2 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">+ {b}</button>
        ))}
      </div>
      <Err s={state} f="zone" /><Err s={state} f="count" /><Err s={state} />
      <Button type="submit" disabled={pending}>{pending ? "Kuruluyor…" : "Salonu kur"}</Button>
      {pending && <p className="sr-only" role="status" aria-live="polite">Salon ve masalar kuruluyor.</p>}
    </form>
  );
}

export function TablesForm({ areaId, areaName }: { areaId: string; areaName: string }) {
  const { state, pending, onSubmit } = useFormAction(addTables.bind(null, areaId), {} as SalonState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="names"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="names" disabled={pending} placeholder="M1-M12 ya da Bahçe 1, Bahçe 2" aria-label={`${areaName} masa adları`} className="w-72" required {...errorProps(state, "names")} /><Err s={state} f="names" /><Err s={state} /></div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Ekleniyor…" : "Masa ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Masalar ekleniyor.</span>}
    </form>
  );
}

export function StationForm({ initial, printers }: { initial?: { id: string; name: string; printer: string | null }; printers: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(saveStation.bind(null, initial?.id ?? null), {} as SalonState);
  const errorPrefix = useId();
  const nameErrorId = `${errorPrefix}-station-name-error`;
  const printerErrorId = `${errorPrefix}-station-printer-error`;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error || initial) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [initial, state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div><Field label="İstasyon adı"><Input key={initial?.id ?? state.savedAt ?? 0} name="name" disabled={pending} defaultValue={initial?.name} placeholder="Izgara" required aria-invalid={state.field === "name" && !!state.error || undefined} aria-describedby={state.field === "name" && state.error ? nameErrorId : undefined} /></Field><Err s={state} f="name" id={nameErrorId} /></div>
      <div className="w-56">
        <Field label="Mutfak yazıcısı"><Select key={initial?.id ?? state.savedAt ?? 0} disabled={pending} name="printer" options={[{ value: "", label: "Yazıcı yok (yalnız ekran)" }, ...printers]} defaultValue={initial?.printer ?? ""} placeholder="Yazıcı yok (yalnız ekran)" aria-invalid={state.field === "printer" && !!state.error || undefined} aria-describedby={state.field === "printer" && state.error ? printerErrorId : undefined} /></Field>
        <Err s={state} f="printer" id={printerErrorId} />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : initial ? "Kaydet" : "İstasyon ekle"}</Button>
      <Saved s={state} />
      {pending && <span className="sr-only" role="status" aria-live="polite">Mutfak istasyonu kaydediliyor.</span>}
    </form>
  );
}

export function CategoryStation({ categoryId, value, stations, currentIsOtherBranch = false }: { categoryId: string; value: string; stations: Option[]; currentIsOtherBranch?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className={`w-56 ${pending ? "opacity-60" : ""}`}>
      {currentIsOtherBranch && <p className="mb-1 text-xs text-muted">Mevcut atama başka şubede.</p>}
      <Select key={`${value}-${currentIsOtherBranch}`} disabled={pending} ariaLabel="Kategori için aktif şubede yeni istasyon ataması" options={[{ value: "", label: currentIsOtherBranch ? "İstasyonsuz yap" : "İstasyonsuz" }, ...stations]} defaultValue={currentIsOtherBranch ? "" : value} placeholder={currentIsOtherBranch ? "Yeni atama seçin" : "İstasyonsuz"} onChange={(v) => start(() => setCategoryStation(categoryId, v))} />
      {pending && <span className="sr-only" role="status" aria-live="polite">Kategori istasyonu kaydediliyor.</span>}
    </div>
  );
}

export type GroupInitial = { id: string; name: string; min: number; max: number; options: { name: string; delta: number }[] };
const optionLine = (o: { name: string; delta: number }) => (o.delta ? `${o.name} ${o.delta > 0 ? "+" : "-"}${formatTL(Math.abs(o.delta)).replace(" ₺", "")}` : o.name);

export function OptionGroupForm({ initial }: { initial?: GroupInitial }) {
  const { state, pending, onSubmit } = useFormAction(saveOptionGroup.bind(null, initial?.id ?? null), {} as SalonState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error || initial) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [initial, state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] lg:grid-cols-2">
        <div className="lg:col-span-2"><Field label="Grup adı"><Input name="name" disabled={pending} defaultValue={initial?.name} placeholder="Pişirme" required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
        <Field label="En az" hint="0 = isteğe bağlı"><Input name="min" disabled={pending} inputMode="numeric" defaultValue={initial?.min ?? 0} /></Field>
        <div><Field label="En çok"><Input name="max" disabled={pending} inputMode="numeric" defaultValue={initial?.max ?? 1} {...errorProps(state, "max")} /></Field><Err s={state} f="max" /></div>
        <div className="sm:col-span-3 lg:col-span-2">
          <Field label="Seçenekler" hint="Satır başına bir seçenek; fiyat farkı sonda: Peynir +15 · Yarım porsiyon -90">
            <Textarea name="options" disabled={pending} rows={4} defaultValue={initial?.options.map(optionLine).join("\n")} placeholder={"Az pişmiş\nOrta\nİyi pişmiş"} {...errorProps(state, "options")} />
          </Field>
          <Err s={state} f="options" />
        </div>
      </div>
      <Err s={state} />
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Grubu kaydet"}</Button><Saved s={state} /></div>
      {pending && <span className="sr-only" role="status" aria-live="polite">Seçenek grubu kaydediliyor.</span>}
    </form>
  );
}

const ROLES = [["kasa", "Kasa"], ["garson", "Garson tableti"], ["mutfak", "Mutfak ekranı"], ["kurye", "Kurye telefonu"]] as const;

export function DeviceRoleForm({ deviceId, role: initialRole, stations: initialStations, stationOptions, hasUnavailableStations = false }: { deviceId: string; role: string; stations: string[]; stationOptions: Option[]; hasUnavailableStations?: boolean }) {
  const { state, pending, onSubmit } = useFormAction(setDeviceRole.bind(null, deviceId), {} as SalonState);
  const [role, setRole] = useState(initialRole);
  return (
    <form onSubmit={onSubmit} className="text-sm">
      <fieldset disabled={pending} className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">Cihaz rolü</legend>
      <div className="flex gap-1">
        {ROLES.map(([v, l]) => (
          <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-2.5 py-2 outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${role === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>
            <input type="radio" name="role" value={v} required checked={role === v} onChange={() => setRole(v)} className="peer sr-only" />
            {l}
          </label>
        ))}
      </div>
      {role === "mutfak" && stationOptions.map((s) => (
        <label key={s.value} className="flex min-h-11 items-center gap-1"><input type="checkbox" name="stations" value={s.value} disabled={pending} defaultChecked={initialStations.includes(s.value)} className="size-4 accent-[var(--color-brand)]" />{s.label}</label>
      ))}
      {role === "mutfak" && stationOptions.length === 0 && <p className="w-full text-xs text-muted">Bu şubede istasyon yok. <a href="/yonetim/istasyonlar" className="font-medium text-brand underline">Önce istasyon ekleyin.</a></p>}
      {role === "mutfak" && hasUnavailableStations && <p className="w-full text-xs text-warn" role="status">Bu cihazda başka şubeye ait istasyon seçimi var; şube kapsamı nedeniyle gösterilmiyor. Kaydederken o eski seçim kaldırılır.</p>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Rolü kaydet"}</Button>
      <Saved s={state} />
      <Err s={state} />
      {pending && <span className="sr-only" role="status" aria-live="polite">Cihaz rolü ve istasyonları kaydediliyor.</span>}
      </fieldset>
    </form>
  );
}
