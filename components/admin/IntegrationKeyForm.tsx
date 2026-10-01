"use client";
import { useState } from "react";
import { createIntegrationKey, type KeyState } from "@/lib/admin/integration-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

function KeyBox({ s, scope }: { s: KeyState; scope: "stats" | "growth" }) {
  const [copied, setCopied] = useState(false);
  if (!s.key) return s.error && !s.field ? <p className="mt-2 text-sm text-bad">{s.error}</p> : null;
  return (
    <div className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
      <div className="text-sm">{s.name} için erişim anahtarı — <b>yalnız şimdi gösterilir</b>, kaydedin.</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code data-testid="integration-key" className="break-all rounded bg-white px-2 py-1 font-mono text-sm">{s.key}</code>
        <button type="button" className="text-sm text-brand underline" onClick={() => navigator.clipboard.writeText(s.key!).then(() => setCopied(true))}>{copied ? "Kopyalandı" : "Kopyala"}</button>
      </div>
      <p className="mt-2 text-sm text-ink-2">{scope === "growth" ? "Büyüme Merkezi/Laya bağlantısında kullanılır. Yalnız toplu, PII'siz büyüme özelliklerini okur; hiçbir şeyi değiştiremez." : "Ajans panelinde Bağlantılar → ÇabukPOS alanına yapıştırılır. Anahtar yalnız günlük satış özetini okur; hiçbir şeyi değiştiremez."}</p>
    </div>
  );
}

export function IntegrationKeyForm({ scope = "stats" }: { scope?: "stats" | "growth" }) {
  const { state, pending, onSubmit } = useFormAction(createIntegrationKey, {} as KeyState);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="scope" value={scope} />
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Field label={scope === "growth" ? "Büyüme bağlantısı adı" : "Ajans adı"}><Input name="name" placeholder={scope === "growth" ? "Laya Büyüme" : "Zirve Ajans"} maxLength={40} required /></Field>
          {state.field === "name" && state.error && <p className="mt-1 text-sm text-bad">{state.error}</p>}
        </div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Oluşturuluyor…" : scope === "growth" ? "Büyüme erişimi oluştur" : "Ajans erişimi oluştur"}</Button>
      </div>
      <KeyBox s={state} scope={scope} />
    </form>
  );
}
