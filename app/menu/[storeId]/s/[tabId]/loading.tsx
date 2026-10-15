export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-8 pt-8" aria-busy="true" aria-label="Sipariş durumu yükleniyor" role="status">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-8 w-64 max-w-full rounded-lg bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-3 motion-safe:animate-pulse" />
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-16 rounded-xl border border-line bg-surface motion-safe:animate-pulse" />)}
      </div>
    </main>
  );
}
