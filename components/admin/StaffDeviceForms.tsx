"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveStaff, type StaffState } from "@/lib/admin/staff-actions";
import { createDevice, type DeviceState } from "@/lib/admin/device-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

const Err = ({ s, f }: { s: { error?: string; field?: string }; f: string }) => (s.field === f && s.error ? <p id={`staff-device-${f}-error`} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: { error?: string; field?: string }, f: string) => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `staff-device-${f}-error` }
  : {};

export function StaffForm({ initial }: { initial?: { id: string; name: string; role: "kasiyer" | "mudur" | "garson" | "kurye" } }) {
  const { state, pending, onSubmit } = useFormAction(saveStaff.bind(null, initial?.id ?? null), {} as StaffState);
  const [role, setRole] = useState<string>(initial?.role ?? "kasiyer");
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
      <div key={initial?.id ?? state.savedAt ?? 0} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <div><Field label="Ad soyad"><Input name="name" disabled={pending} defaultValue={initial?.name} required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
        <div>
          <fieldset disabled={pending} aria-describedby={state.field === "role" && state.error ? "staff-device-role-error" : undefined} className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-sm font-medium">Rol</legend>
            <div className="flex flex-wrap gap-1">
            {[["kasiyer", "Kasiyer"], ["garson", "Garson"], ["kurye", "Kurye"], ["mudur", "Müdür"]].map(([v, l]) => (
              <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${role === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>
                <input type="radio" name="role" value={v} required checked={role === v} onChange={() => setRole(v)} aria-describedby={state.field === "role" && state.error ? "staff-device-role-error" : undefined} className="peer sr-only" />
                {l}
              </label>
            ))}
            </div>
            <Err s={state} f="role" />
          </fieldset>
        </div>
        <div><Field label="PIN" hint={initial ? "Boş bırakırsanız değişmez" : "4-6 hane"}><Input name="pin" disabled={pending} inputMode="numeric" autoComplete="off" maxLength={6} required={!initial} {...errorProps(state, "pin")} /></Field><Err s={state} f="pin" /></div>
      </div>
      {initial && (
        <div className="max-w-xs">
          <Field label="Hesap şifreniz" hint="Rol veya PIN değişiminde gerekli"><PasswordInput name="sifre" disabled={pending} autoComplete="current-password" {...errorProps(state, "sifre")} /></Field>
          <Err s={state} f="sifre" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Personeli kaydet"}</Button>
        {pending && <span className="sr-only" role="status" aria-live="polite">Personel bilgileri kaydediliyor.</span>}
        {state.savedAt && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
    </form>
  );
}

function CodeBox({ s }: { s: DeviceState }) {
  if (!s.code) return s.error && !s.field ? <p className="mt-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null;
  return (
    <div className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
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
        <div className="min-w-40 flex-1"><Field label="Cihaz adı"><Input name="name" disabled={pending} placeholder="Kasa 1" required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
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
