import { SkipToContent } from "@/components/SkipToContent";

export function RateLimitNotice({ resource }: { resource: string }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <SkipToContent />
      <section role="alert" aria-labelledby="main-content" className="max-w-md rounded-[18px] border border-line bg-surface p-6 shadow-card">
        <h1 id="main-content" tabIndex={-1} className="rounded-sm text-lg font-semibold text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Çok fazla istek</h1>
        <p className="mt-2 text-sm text-ink-2">{resource} kısa sürede çok kez yenilendi. Bir dakika sonra sayfayı tekrar deneyin.</p>
      </section>
    </main>
  );
}
