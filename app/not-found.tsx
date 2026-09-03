import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md text-center">
        <p className="font-display text-5xl font-extrabold text-brand">404</p>
        <h1 className="mt-3 text-xl font-bold text-ink">Sayfa bulunamadı</h1>
        <p className="mt-2 text-[15px] text-muted">
          Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}
