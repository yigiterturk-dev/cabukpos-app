"use client";
// components/admin/SessionForms.tsx — #9 oturum düşme formları (app/yonetim/guvenlik).
import { digerOturumlariKapat, tumCihazlardanCik, type SessionState } from "@/lib/auth/actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

function SifreliForm({ action, buton, variant }: { action: (s: SessionState, f: FormData) => Promise<SessionState>; buton: string; variant: "primary" | "danger" }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as SessionState);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Şifreniz" hint="Hassas işlem — şifrenizi yeniden girin"><PasswordInput name="sifre" autoComplete="current-password" required /></Field>
      {state.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-ok">{state.ok}</p>}
      <Button type="submit" variant={variant} disabled={pending}>{pending ? "Uygulanıyor…" : buton}</Button>
    </form>
  );
}

export function OturumKapatFormlari() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <SifreliForm action={digerOturumlariKapat} buton="Diğer cihazların oturumlarını kapat" variant="primary" />
      <SifreliForm action={tumCihazlardanCik} buton="Tüm cihazlardan çık" variant="danger" />
    </div>
  );
}
