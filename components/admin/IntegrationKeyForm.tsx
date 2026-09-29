"use client";
import { useState } from "react";
import { createIntegrationKey, type KeyState } from "@/lib/admin/integration-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

function KeyBox({ s }: { s: KeyState }) {
  const [copied, setCopied] = useState(false);
  if (!s.key) return s.error && !s.field ? <p className="mt-2 text-sm text-red-700">{s.error}</p> : null;
  return (
    <div className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
      <div className="text-sm">{s.name} için erişim anahtarı — <b>yalnız şimdi gösterilir</b>, kaydedin.</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code data-testid="integration-key" className="break-all rounded bg-white px-2 py-1 font-mono text-sm">{s.key}</code>
        <button type="button" className="text-sm text-brand underline" onClick={() => navigator.clipboard.writeText(s.key!).then(() => setCopied(true))}>{copied ? "Kopyalandı" : "Kopyala"}</button>
      </div>
      <p className="mt-2 text-sm text-stone-700">Ajans panelinde Bağlantılar → ÇabukPOS alanına yapıştırılır. Anahtar yalnız günlük satış özetini okur; hiçbir şeyi değiştiremez.</p>
    </div>
  );
}

export function IntegrationKeyForm() {
  const { state, pending, onSubmit } = useFormAction(createIntegrationKey, {} as KeyState);
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Field label="Ajans adı"><Input name="name" placeholder="Zirve Ajans" maxLength={40} required /></Field>
          {state.field === "name" && state.error && <p className="mt-1 text-sm text-red-700">{state.error}</p>}
        </div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Oluşturuluyor…" : "Ajans erişimi oluştur"}</Button>
      </div>
      <KeyBox s={state} />
    </form>
  );
}
