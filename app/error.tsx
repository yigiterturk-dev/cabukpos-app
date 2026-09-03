"use client";

// Rota düzeyi hata sınırı. Hata DETAYI kullanıcıya GÖSTERİLMEZ (stack/DB mesajı sızdırmaz);
// yalnız Next'in ürettiği digest gösterilir, log ile eşleştirmek için.
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-ink">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-[15px] text-muted">
          İşlem tamamlanamadı. Tekrar denemek sorunu genellikle çözer.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[12px] text-muted">Referans: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
        >
          Tekrar dene
        </button>
      </div>
    </main>
  );
}
