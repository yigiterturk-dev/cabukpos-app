"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createIntegrationKey, type KeyState } from "@/lib/admin/integration-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

function KeyBox({ s, scope }: { s: KeyState; scope: "stats" | "growth" }) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!s.key) return;
    const frame = window.requestAnimationFrame(() => copyButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [s.key]);
  useEffect(() => {
    if (copyState !== "copied" && copyState !== "failed") return;
    const frame = window.requestAnimationFrame(() => copyButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [copyState]);
  if (!s.key) return s.error && !s.field ? <p className="mt-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null;
  const copyKey = async () => {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(s.key!);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  return (
    <div className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
      <div className="text-sm">{s.name} için erişim anahtarı — <b>yalnız şimdi gösterilir</b>, kaydedin.</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code data-testid="integration-key" className="break-all rounded bg-surface px-2 py-1 font-mono text-sm">{s.key}</code>
        <button ref={copyButtonRef} type="button" disabled={copyState === "copying"} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50" onClick={() => void copyKey()}>{copyState === "copied" ? "Kopyalandı" : copyState === "copying" ? "Kopyalanıyor…" : copyState === "failed" ? "Tekrar dene" : "Kopyala"}</button>
      </div>
      <p className="mt-2 text-sm" role="status" aria-live="polite" aria-atomic="true">
        {copyState === "copied" ? "Anahtar panoya kopyalandı." : copyState === "failed" ? "Kopyalanamadı; anahtarı seçip elle kopyalayın." : copyState === "copying" ? "Anahtar panoya kopyalanıyor." : ""}
      </p>
      <p className="mt-2 text-sm text-ink-2">{scope === "growth" ? "Büyüme Merkezi/Laya bağlantısında kullanılır. Yalnız toplu, PII'siz büyüme özelliklerini okur; hiçbir şeyi değiştiremez." : "Ajans panelinde Bağlantılar → ÇabukPOS alanına yapıştırılır. Anahtar yalnız günlük satış özetini okur; hiçbir şeyi değiştiremez."}</p>
    </div>
  );
}

export function IntegrationKeyForm({ scope = "stats" }: { scope?: "stats" | "growth" }) {
  const { state, pending, onSubmit } = useFormAction(createIntegrationKey, {} as KeyState);
  const errorId = useId();
  const nameErrorId = `${errorId}-name-error`;
  const passwordErrorId = `${errorId}-password-error`;
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as KeyState) : state;
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }}>
      <input type="hidden" name="scope" value={scope} />
      <div key={state.key ?? "credentials"} className="flex flex-wrap items-start gap-3">
        <div>
          <Field label={scope === "growth" ? "Büyüme bağlantısı adı" : "Ajans adı"} hint="2–40 karakter"><Input name="name" disabled={pending} placeholder={scope === "growth" ? "Laya Büyüme" : "Zirve Ajans"} minLength={2} maxLength={40} pattern=".*\S.*\S.*" required aria-invalid={displayState.field === "name" && !!displayState.error || undefined} aria-describedby={displayState.field === "name" && displayState.error ? nameErrorId : undefined} /></Field>
          {displayState.field === "name" && displayState.error && <p id={nameErrorId} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
        </div>
        <div>
          <Field label="Hesap şifreniz" hint="Kimlik bilgisi üretimi için teyit"><PasswordInput name="sifre" disabled={pending} autoComplete="current-password" required aria-invalid={displayState.field === "sifre" && !!displayState.error || undefined} aria-describedby={displayState.field === "sifre" && displayState.error ? passwordErrorId : undefined} /></Field>
          {displayState.field === "sifre" && displayState.error && <p id={passwordErrorId} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
        </div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Oluşturuluyor…" : scope === "growth" ? "Büyüme erişimi oluştur" : "Ajans erişimi oluştur"}</Button>
      </div>
      {pending && <p className="sr-only" role="status" aria-live="polite">Erişim anahtarı oluşturuluyor.</p>}
      <KeyBox s={{ ...state, error: displayState.error, field: displayState.field }} scope={scope} />
    </form>
  );
}
