"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveStaff, setStaffActive, type StaffState } from "@/lib/admin/staff-actions";
import { createDevice, type DeviceState } from "@/lib/admin/device-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { STAFF_PERMISSIONS, staffCan, type StaffPermissions, type StaffPermission } from "@/lib/core/staff-permissions";

const Err = ({ s, f }: { s: { error?: string; field?: string }; f: string }) => (s.field === f && s.error ? <p id={`staff-device-${f}-error`} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: { error?: string; field?: string }, f: string) => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `staff-device-${f}-error` }
  : {};

function StaffActiveSubmit({ active, name }: { active: boolean; name: string }) {
  const { pending } = useFormStatus();
  const label = active ? "Pasifleştir" : "Aktifleştir";
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} aria-label={pending ? `Kaydediliyor: ${name}` : `${label}: ${name}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50">
        {pending ? "Kaydediliyor…" : label}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">{name} personel durumu kaydediliyor.</span>}
    </>
  );
}

export function StaffActiveForm({ id, active, name, className = "" }: { id: string; active: boolean; name: string; className?: string }) {
  return <form action={setStaffActive.bind(null, id, !active)} className={className}><StaffActiveSubmit active={active} name={name} /></form>;
}

export function StaffForm({ initial }: { initial?: { id: string; name: string; role: "kasiyer" | "mudur" | "garson" | "kurye"; permissions?: StaffPermissions | null } }) {
  const { state, pending, onSubmit } = useFormAction(saveStaff.bind(null, initial?.id ?? null), {} as StaffState);
  const [role, setRole] = useState<string>(initial?.role ?? "kasiyer");
  const [custom, setCustom] = useState(!!initial?.permissions);
  const [edited, setEdited] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const isEditing = Boolean(initial);
  const displayState = edited || pending ? {} as StaffState : state;
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => {
      if (isEditing) saveButtonRef.current?.focus();
      else formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, pending, state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="space-y-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <div><Field label="Ad soyad" hint="2–60 karakter"><Input name="name" disabled={pending} minLength={2} maxLength={60} pattern=".*\S.*\S.*" defaultValue={initial?.name} required {...errorProps(displayState, "name")} /></Field><Err s={displayState} f="name" /></div>
        <div>
          <fieldset disabled={pending} aria-describedby={displayState.field === "role" && displayState.error ? "staff-device-role-error" : undefined} className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-sm font-medium">Rol</legend>
            <div className="flex flex-wrap gap-1">
            {[["kasiyer", "Kasiyer"], ["garson", "Garson"], ["kurye", "Kurye"], ["mudur", "Müdür"]].map(([v, l]) => (
              <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${role === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>
                <input type="radio" name="role" value={v} required checked={role === v} onChange={() => setRole(v)} aria-describedby={displayState.field === "role" && displayState.error ? "staff-device-role-error" : undefined} className="peer sr-only" />
                {l}
              </label>
            ))}
            </div>
            <Err s={displayState} f="role" />
          </fieldset>
        </div>
        <div><Field label="PIN" hint={initial ? "Boş bırakırsanız değişmez · yenisi 4-6 rakam" : "4-6 hane rakam"}><PasswordInput name="pin" disabled={pending} inputMode="numeric" autoComplete="new-password" minLength={4} maxLength={6} pattern="[0-9]{4,6}" required={!initial} {...errorProps(displayState, "pin")} /></Field><Err s={displayState} f="pin" /></div>
      </div>
      <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">İşlem yetkileri</summary><label className="my-3 flex min-h-11 items-center gap-2"><input type="checkbox" name="customPermissions" checked={custom} onChange={e=>setCustom(e.target.checked)} disabled={pending}/>Bu personele özel yetkiler</label>{custom?<fieldset disabled={pending} className="grid gap-2 sm:grid-cols-2">{Object.entries(STAFF_PERMISSIONS).map(([key,label])=><label key={`${role}:${key}`} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="permission" value={key} defaultChecked={staffCan({role,permissions:initial?.permissions},key as StaffPermission)}/>{label}</label>)}</fieldset>:<p className="text-sm text-muted">Rolün varsayılan yetkileri kullanılır.</p>}<p className="mt-2 text-xs text-muted">Çevrimdışı cihazlar yeni yetkileri katalog eşitlendiğinde alır. Sunucu güncel yetkiyi ayrıca kontrol eder.</p></details>
      {initial && (
        <div className="max-w-xs">
          <Field label="Hesap şifreniz" hint="Rol, PIN veya işlem yetkisi değişiminde gerekli"><PasswordInput name="sifre" disabled={pending} autoComplete="current-password" {...errorProps(displayState, "sifre")} /></Field>
          <Err s={displayState} f="sifre" />
        </div>
      )}
      {displayState.error && !displayState.field && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
      <div className="flex items-center gap-3">
        <Button ref={saveButtonRef} type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Personeli kaydet"}</Button>
        {pending && <span className="sr-only" role="status" aria-live="polite">Personel bilgileri kaydediliyor.</span>}
        {state.savedAt && !edited && !pending && !state.error && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
    </form>
  );
}

function CodeBox({ s }: { s: DeviceState }) {
  const codeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!s.code && !s.error) return;
    const frame = window.requestAnimationFrame(() => (codeRef.current ?? errorRef.current)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [s.code, s.error]);
  if (!s.code) return s.error && !s.field ? <p ref={errorRef} tabIndex={-1} className="mt-2 break-words text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{s.error}</p> : null;
  return (
    <div ref={codeRef} tabIndex={-1} className="mt-4 rounded-xl border border-brand bg-brand-soft p-4 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" role="status" aria-live="polite">
      <div className="text-sm">{s.deviceName} için eşleme kodu</div>
      <div data-testid="pairing-code" className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-brand">{s.code}</div>
      <p className="mt-2 text-sm text-ink-2">Kasa cihazında <b>/kasa</b> adresini açıp bu kodu yazın. {new Date(s.expiresAt!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })} saatine kadar geçerli.</p>
    </div>
  );
}

export function DeviceForm() {
  const { state, pending, onSubmit } = useFormAction(createDevice, {} as DeviceState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1"><Field label="Cihaz adı" hint="2–40 karakter"><Input name="name" disabled={pending} minLength={2} maxLength={40} pattern=".*\S.*\S.*" placeholder="Kasa 1" required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
        <div><Field label="Fiş öneki" hint="1-4 harf/rakam"><Input name="receiptPrefix" disabled={pending} placeholder="K1" maxLength={4} className="w-24 uppercase" required {...errorProps(state, "receiptPrefix")} /></Field><Err s={state} f="receiptPrefix" /></div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Ekleniyor…" : "Cihaz ekle"}</Button>
        {pending && <span className="sr-only" role="status" aria-live="polite">Kasa cihazı ekleniyor.</span>}
      </div>
      <CodeBox s={state} />
    </form>
  );
}

export function NewPairingButton({ action }: { action: () => Promise<DeviceState> }) {
  const [state, dispatch, pending] = useActionState(action, {} as DeviceState);
  return (
    <div>
      <form action={dispatch} aria-busy={pending}>
        <button disabled={pending} aria-busy={pending || undefined} className="inline-flex min-h-11 items-center rounded-lg px-2.5 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{pending ? "Kod üretiliyor…" : "Yeni eşleme kodu"}</button>
        {pending && <span className="sr-only" role="status" aria-live="polite">Kasa cihazı için yeni eşleme kodu üretiliyor.</span>}
      </form>
      <CodeBox s={state} />
    </div>
  );
}
