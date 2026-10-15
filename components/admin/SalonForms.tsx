"use client";
// M5 salon yönetim formları: bölge, masa, istasyon, seçenek grubu, cihaz rolü, kategori istasyonu.
import { useState, useTransition } from "react";
import { addTables, salonSetup, saveArea, saveOptionGroup, saveStation, setCategoryStation, setDeviceRole, type SalonState } from "@/lib/admin/salon-actions";
import { formatTL } from "@/lib/core/money";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const Err = ({ s, f }: { s: SalonState; f?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const Saved = ({ s }: { s: SalonState }) => (s.savedAt ? <span className="text-sm text-ok" role="status">Kaydedildi.</span> : null);

export function AreaForm() {
  const { state, pending, onSubmit } = useFormAction(saveArea, {} as SalonState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="name" placeholder="Yeni bölge (ör. Salon, Bahçe)" aria-label="Bölge adı" className="w-64" required /><Err s={state} f="name" /></div>
      <Button type="submit" disabled={pending}>Bölge ekle</Button>
    </form>
  );
}

const ONEMLI_BOLGELER = ["Salon", "Bahçe", "Teras", "Kapalı alan", "Üst kat"] as const;

/** İlk kurulum: bölge adı + masa sayısıyla salonu tek seferde kurar. */
export function SalonSetup() {
  const { state, pending, onSubmit } = useFormAction(salonSetup, {} as SalonState);
  const [rows, setRows] = useState([
    { name: "Salon", count: "8" },
    { name: "Bahçe", count: "4" },
  ]);
  const duzenle = (i: number, yama: Partial<{ name: string; count: string }>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...yama } : r)));
  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-3">
      <p className="text-sm text-muted">Bölümlerini yaz, masa sayısını gir — masa planı kasaya ve garson tabletine otomatik düşer. Masa adları bölümün baş harfine göre verilir (S1…, B1…).</p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1"><Input name="zone" value={r.name} onChange={(e) => duzenle(i, { name: e.target.value })} placeholder="Bölge adı (Salon, Bahçe, Teras…)" aria-label={`${i + 1}. bölge adı`} maxLength={40} /></div>
          <div className="w-28"><Input name="count" value={r.count} onChange={(e) => duzenle(i, { count: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Masa" aria-label={`${i + 1}. bölge masa sayısı`} /></div>
          <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`${r.name} bölümünü kaldır`}
            className={`flex size-11 items-center justify-center rounded-lg border border-line text-muted outline-none hover:text-bad focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${rows.length === 1 ? "invisible" : ""}`}>×</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted">Hızlı ekle:</span>
        {ONEMLI_BOLGELER.map((b) => (
          <button key={b} type="button" onClick={() => setRows((rs) => [...rs, { name: b, count: "4" }])}
            className="rounded-full border border-line px-2.5 py-1 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">+ {b}</button>
        ))}
      </div>
      <Err s={state} f="zone" /><Err s={state} f="count" /><Err s={state} />
      <Button type="submit" disabled={pending}>{pending ? "Kuruluyor…" : "Salonu kur"}</Button>
    </form>
  );
}

export function TablesForm({ areaId, areaName }: { areaId: string; areaName: string }) {
  const { state, pending, onSubmit } = useFormAction(addTables.bind(null, areaId), {} as SalonState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="names" placeholder="M1-M12 ya da Bahçe 1, Bahçe 2" aria-label={`${areaName} masa adları`} className="w-72" required /><Err s={state} f="names" /><Err s={state} /></div>
      <Button type="submit" variant="secondary" disabled={pending}>Masa ekle</Button>
    </form>
  );
}

export function StationForm({ initial, printers }: { initial?: { id: string; name: string; printer: string | null }; printers: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(saveStation.bind(null, initial?.id ?? null), {} as SalonState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div><Field label="İstasyon adı"><Input key={initial?.id ?? state.savedAt ?? 0} name="name" defaultValue={initial?.name} placeholder="Izgara" required /></Field><Err s={state} f="name" /></div>
      <div className="w-56">
        <div className="mb-1.5 text-sm font-medium">Mutfak yazıcısı</div>
        <Select ariaLabel="Mutfak yazıcısı" name="printer" options={[{ value: "", label: "Yazıcı yok (yalnız ekran)" }, ...printers]} defaultValue={initial?.printer ?? ""} placeholder="Yazıcı yok (yalnız ekran)" />
        <Err s={state} f="printer" />
      </div>
      <Button type="submit" disabled={pending}>{initial ? "Kaydet" : "İstasyon ekle"}</Button>
      <Saved s={state} />
    </form>
  );
}

export function CategoryStation({ categoryId, value, stations }: { categoryId: string; value: string; stations: Option[] }) {
  const [pending, start] = useTransition();
  return (
    <div className={`w-56 ${pending ? "opacity-60" : ""}`}>
      <Select ariaLabel="İstasyon" options={[{ value: "", label: "İstasyonsuz" }, ...stations]} defaultValue={value} placeholder="İstasyonsuz" onChange={(v) => start(() => setCategoryStation(categoryId, v))} />
    </div>
  );
}

export type GroupInitial = { id: string; name: string; min: number; max: number; options: { name: string; delta: number }[] };
const optionLine = (o: { name: string; delta: number }) => (o.delta ? `${o.name} ${o.delta > 0 ? "+" : "-"}${formatTL(Math.abs(o.delta)).replace(" ₺", "")}` : o.name);

export function OptionGroupForm({ initial }: { initial?: GroupInitial }) {
  const { state, pending, onSubmit } = useFormAction(saveOptionGroup.bind(null, initial?.id ?? null), {} as SalonState);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] lg:grid-cols-2">
        <div className="lg:col-span-2"><Field label="Grup adı"><Input name="name" defaultValue={initial?.name} placeholder="Pişirme" required /></Field><Err s={state} f="name" /></div>
        <Field label="En az" hint="0 = isteğe bağlı"><Input name="min" inputMode="numeric" defaultValue={initial?.min ?? 0} /></Field>
        <div><Field label="En çok"><Input name="max" inputMode="numeric" defaultValue={initial?.max ?? 1} /></Field><Err s={state} f="max" /></div>
        <div className="sm:col-span-3 lg:col-span-2">
          <Field label="Seçenekler" hint="Satır başına bir seçenek; fiyat farkı sonda: Peynir +15 · Yarım porsiyon -90">
            <Textarea name="options" rows={4} defaultValue={initial?.options.map(optionLine).join("\n")} placeholder={"Az pişmiş\nOrta\nİyi pişmiş"} />
          </Field>
          <Err s={state} f="options" />
        </div>
      </div>
      <Err s={state} />
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Grubu kaydet"}</Button><Saved s={state} /></div>
    </form>
  );
}

const ROLES = [["kasa", "Kasa"], ["garson", "Garson tableti"], ["mutfak", "Mutfak ekranı"], ["kurye", "Kurye telefonu"]] as const;

export function DeviceRoleForm({ deviceId, role: initialRole, stations: initialStations, stationOptions }: { deviceId: string; role: string; stations: string[]; stationOptions: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(setDeviceRole.bind(null, deviceId), {} as SalonState);
  const [role, setRole] = useState(initialRole);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="role" value={role} />
      <div className="flex gap-1" role="group" aria-label="Cihaz rolü">
        {ROLES.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={role === v} onClick={() => setRole(v)} className={`inline-flex min-h-11 items-center rounded-lg border px-2.5 py-2 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${role === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>
      {role === "mutfak" && stationOptions.map((s) => (
        <label key={s.value} className="flex items-center gap-1"><input type="checkbox" name="stations" value={s.value} defaultChecked={initialStations.includes(s.value)} className="size-4 accent-[var(--color-brand)]" />{s.label}</label>
      ))}
      <Button type="submit" variant="secondary" disabled={pending}>Rolü kaydet</Button>
      <Saved s={state} />
      <Err s={state} />
    </form>
  );
}
