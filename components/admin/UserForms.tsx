"use client";
// Kullanıcı yönetimi formları: hesap açma, rol/şube/pasif erişim ve davet bağlantısı.
import { useEffect, useRef, useState } from "react";
import { buttonClass, Field, Input } from "@/components/ui";
import { Select } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import type { UserState } from "@/lib/admin/user-actions";

type StoreOpt = { id: string; name: string };
type UserAction = (state: UserState, form: FormData) => Promise<UserState>;

const storeOptions = (stores: StoreOpt[], includeHQ = true) => [...(includeHQ ? [{ value: "", label: "Tüm şubeler (HQ)" }] : []), ...stores.map((s) => ({ value: s.id, label: s.name }))];

function CopyLink({ url }: { url: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-start gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 font-mono text-xs">{url}</code>
      <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">
        {copy === "copied" ? "Kopyalandı" : copy === "failed" ? "Tekrar dene" : "Kopyala"}
      </button>
      <span className="basis-full text-xs text-muted" role="status" aria-live="polite" aria-atomic="true">
        {copy === "copied" ? "Davet bağlantısı kopyalandı." : copy === "failed" ? "Kopyalanamadı; bağlantıyı elle seçip kopyalayın." : "Bağlantı 3 gün geçerlidir ve yalnız bir kez gösterilir."}
      </span>
    </div>
  );
}

function Submit({ label, pendingLabel, pending }: { label: string; pendingLabel: string; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function CreateUserForm({ action, roleOwner, stores }: { action: UserAction; roleOwner: boolean; stores: StoreOpt[] }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as UserState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [role, setRole] = useState("mudur");
  useEffect(() => { if (state.error) errorRef.current?.focus(); }, [state.error]);
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="p-5">
      {state.error && <p ref={errorRef} tabIndex={-1} className="mb-3 break-words text-sm text-bad outline-none" role="alert" aria-live="assertive">{state.error}</p>}
      {state.ok && <p className="mb-3 break-words text-sm text-ok" role="status" aria-live="polite">{state.ok}</p>}
      <fieldset disabled={pending} aria-busy={pending} className="m-0 flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
        <Field label="Ad soyad" hint="2–120 karakter"><Input name="name" minLength={2} maxLength={120} className="w-56" required autoComplete="off" /></Field>
        <Field label="E-posta" hint="Giriş adresi"><Input name="email" type="email" maxLength={254} className="w-64" required autoComplete="off" /></Field>
        <div className="w-48">
          <Field label="Rol">
            <Select name="role" options={roleOwner ? [{ value: "mudur", label: "Müdür" }, { value: "sahip", label: "İşletme sahibi" }] : [{ value: "mudur", label: "Müdür" }]} defaultValue="mudur" onChange={setRole} aria-required />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Şube" hint={role === "sahip" ? "Sahip tüm şubelere erişir" : "HQ = tüm şubeler"}>
            <Select name="storeId" options={storeOptions(stores, roleOwner)} defaultValue={roleOwner ? "" : stores[0]?.id ?? ""} disabled={role === "sahip"} />
          </Field>
        </div>
        <Submit label="Kullanıcı aç" pendingLabel="Açılıyor…" pending={pending} />
      </fieldset>
      {state.inviteUrl && <CopyLink url={state.inviteUrl} />}
    </form>
  );
}

export function UserAccessForm({ action, user, stores, self, roleOwner }: {
  action: UserAction;
  user: { id: string; role: "sahip" | "mudur"; storeId: string | null; active: boolean };
  stores: StoreOpt[];
  self: boolean;
  roleOwner: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(action, {} as UserState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [role, setRole] = useState<string>(user.role);
  const [active, setActive] = useState(user.active);
  useEffect(() => { if (state.error) errorRef.current?.focus(); }, [state.error]);
  if (self) return <p className="text-xs text-muted">Kendi hesabınız — erişim değişikliği başka bir sahip tarafından yapılır.</p>;
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="flex min-w-0 flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={user.id} />
      {state.error && <p ref={errorRef} tabIndex={-1} className="basis-full break-words text-sm text-bad outline-none" role="alert" aria-live="assertive">{state.error}</p>}
      {state.ok && <p className="basis-full break-words text-sm text-ok" role="status" aria-live="polite">{state.ok}</p>}
      <div className="w-44"><Field label="Rol"><Select name="role" options={roleOwner ? [{ value: "mudur", label: "Müdür" }, { value: "sahip", label: "Sahip" }] : [{ value: "mudur", label: "Müdür" }]} defaultValue={user.role} onChange={setRole} disabled={pending} aria-required /></Field></div>
      <div className="w-48"><Field label="Şube"><Select name="storeId" options={storeOptions(stores, roleOwner)} defaultValue={user.storeId ?? ""} disabled={pending || role === "sahip"} /></Field></div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="active" checked={active} disabled={pending} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-brand" />
        Aktif
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass("secondary")} disabled:cursor-wait disabled:opacity-60`}>{pending ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}

export function InviteUserForm({ action, userId }: { action: UserAction; userId: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as UserState);
  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="min-w-0">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Gönderiliyor…" : "Davet gönder"}
      </button>
      {state.error && <p className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      {state.ok && <p className="mt-1 break-words text-xs text-ok" role="status" aria-live="polite">{state.ok}</p>}
      {state.inviteUrl && <CopyLink url={state.inviteUrl} />}
    </form>
  );
}
