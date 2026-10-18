"use client";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    document.getElementById("menu-error-title")?.focus();
  }, [error]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 id="menu-error-title" tabIndex={-1} className="rounded-sm text-xl font-semibold outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Menü şu anda görüntülenemiyor</h1>
      <p className="max-w-md text-sm text-muted">Kısa bir sorun oldu; tekrar denemek için aşağıya dokunun.</p>
      {error.digest ? <code className="rounded bg-surface-3 px-2 py-1 text-xs">{error.digest}</code> : null}
      <button onClick={retry} className="min-h-11 rounded-lg bg-espresso px-4 py-2 text-sm font-medium text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">
        Tekrar dene
      </button>
    </main>
  );
}
