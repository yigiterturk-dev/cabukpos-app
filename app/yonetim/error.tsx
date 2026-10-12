"use client";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Panel yüklenemedi</h1>
      <p className="max-w-md text-sm text-muted">
        Yönetim paneli beklenmeyen bir hatayla karşılaştı. Tekrar deneyin; sorun sürerse kayıt numarasını destekle paylaşın.
      </p>
      {error.digest ? <code className="rounded bg-surface-3 px-2 py-1 text-xs">{error.digest}</code> : null}
      <button onClick={retry} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
        Tekrar dene
      </button>
    </main>
  );
}
