import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-surface p-8 text-center shadow-card sm:p-10">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-brand">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Sayfa bulunamadı</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Bu adres değişmiş veya kaldırılmış olabilir. Ana sayfaya dönebilir ya da yönetim girişini açabilirsiniz.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-action px-5 text-sm font-semibold text-white outline-none hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60">Ana sayfa</Link>
          <Link href="/giris" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink-2 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yönetim girişi</Link>
        </div>
      </section>
    </main>
  );
}
