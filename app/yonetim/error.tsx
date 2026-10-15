"use client";
import Link from "next/link";
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
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={retry} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white outline-none hover:bg-ink/90 focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          Tekrar dene
        </button>
        <Link href="/giris" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink-2 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          Girişe dön
        </Link>
      </div>
    </main>
  );
}
