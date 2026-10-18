"use client";

import { useState } from "react";

function CopyValue({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">{label}: <code data-testid={testId} className="break-all rounded bg-surface-2 px-1">{value}</code></div>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">
        {state === "copied" ? "Kopyalandı" : state === "failed" ? "Tekrar dene" : "Kopyala"}
      </button>
      <span className="basis-full text-xs text-muted" role="status" aria-live="polite" aria-atomic="true">
        {state === "copied" ? `${label} panoya kopyalandı.` : state === "failed" ? `${label} kopyalanamadı; metni seçip elle kopyalayın.` : ""}
      </span>
    </div>
  );
}

export function WebhookCredentials({ url, secret }: { url: string; secret: string }) {
  return (
    <div className="space-y-2 text-sm">
      <CopyValue label="Webhook adresi" value={url} />
      <CopyValue label="İmza anahtarı (HMAC-SHA256, x-signature)" value={secret} testId="webhook-secret" />
    </div>
  );
}
