"use client";
import { useActionState, useState } from "react";
import { saveStaff, type StaffState } from "@/lib/admin/staff-actions";
import { createDevice, type DeviceState } from "@/lib/admin/device-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: { error?: string; field?: string }; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-sm text-bad">{s.error}</p> : null);

export function StaffForm({ initial }: { initial?: { id: string; name: string; role: "kasiyer" | "mudur" | "garson" | "kurye" } }) {
  const { state, pending, onSubmit } = useFormAction(saveStaff.bind(null, initial?.id ?? null), {} as StaffState);
  const [role, setRole] = useState<string>(initial?.role ?? "kasiyer");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <div><Field label="Ad soyad"><Input name="name" defaultValue={initial?.name} required /></Field><Err s={state} f="name" /></div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Rol</div>
          <input type="hidden" name="role" value={role} />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Rol">
            {[["kasiyer", "Kasiyer"], ["garson", "Garson"], ["kurye", "Kurye"], ["mudur", "Müdür"]].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={role === v} onClick={() => setRole(v)} className={`rounded-lg border px-3 py-2 text-sm ${role === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div><Field label="PIN" hint={initial ? "Boş bırakırsanız değişmez" : "4-6 hane"}><Input name="pin" inputMode="numeric" autoComplete="off" maxLength={6} required={!initial} /></Field><Err s={state} f="pin" /></div>
      </div>
      {initial && (
        <div className="max-w-xs">
          <Field label="Hesap şifreniz" hint="Rol veya PIN değişiminde gerekli"><Input name="sifre" type="password" autoComplete="current-password" /></Field>
          <Err s={state} f="sifre" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Personeli kaydet"}</Button>
        {state.savedAt && <span className="text-sm text-ok">Kaydedildi.</span>}
      </div>
    </form>
  );
}

function CodeBox({ s }: { s: DeviceState }) {
  if (!s.code) return s.error && !s.field ? <p className="mt-2 text-sm text-bad">{s.error}</p> : null;
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
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1"><Field label="Cihaz adı"><Input name="name" placeholder="Kasa 1" required /></Field><Err s={state} f="name" /></div>
        <div><Field label="Fiş öneki" hint="1-4 harf/rakam"><Input name="receiptPrefix" placeholder="K1" maxLength={4} className="w-24 uppercase" required /></Field><Err s={state} f="receiptPrefix" /></div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Ekleniyor…" : "Cihaz ekle"}</Button>
      </div>
      <CodeBox s={state} />
    </form>
  );
}

export function NewPairingButton({ action }: { action: () => Promise<DeviceState> }) {
  const [state, dispatch, pending] = useActionState(action, {} as DeviceState);
  return (
    <div>
      <form action={dispatch}><button disabled={pending} className="font-medium text-brand hover:underline">Yeni eşleme kodu</button></form>
      <CodeBox s={state} />
    </div>
  );
}
