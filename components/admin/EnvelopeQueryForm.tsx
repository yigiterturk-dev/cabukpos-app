"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function QueryButton({ buttonRef }: { buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button ref={buttonRef} type="submit" disabled={pending} aria-busy={pending || undefined} className="press inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Sorgulanıyor…" : "Şimdi sorgula"}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">e-Fatura zarfları sorgulanıyor. Lütfen bekleyin.</span>}
    </>
  );
}

export function EnvelopeQueryForm({ action }: { action: () => void | Promise<void> }) {
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const resultRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => resultRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [result]);
  const run = async () => {
    setResult(null);
    try { await action(); setResult("ok"); }
    catch { setResult("error"); }
  };
  return (
    <form action={run} className="ml-auto shrink-0">
      <QueryButton buttonRef={buttonRef} />
      {result === "ok" && <span ref={resultRef} tabIndex={-1} className="ml-2 text-sm text-ok outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" role="status" aria-live="polite">Zarf sorgusu tamamlandı.</span>}
      {result === "error" && <span ref={resultRef} tabIndex={-1} className="ml-2 text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">Zarf sorgusu tamamlanamadı. Tekrar deneyin.</span>}
    </form>
  );
}
