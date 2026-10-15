export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-8" aria-busy="true" aria-label="Menü yükleniyor" role="status">
      <div className="space-y-2">
        <div className="h-3 w-28 rounded bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-8 w-56 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-3 motion-safe:animate-pulse" />
      </div>
      <div className="mt-8 space-y-7">
        {Array.from({ length: 3 }, (_, section) => (
          <section key={section}>
            <div className="mb-2 h-4 w-32 rounded bg-surface-3 motion-safe:animate-pulse" />
            <ul className="divide-y divide-line">
              {Array.from({ length: 4 }, (_, item) => (
                <li key={item} className="flex items-center gap-3 py-3">
                  <div className="h-4 min-w-0 flex-1 rounded bg-surface-3 motion-safe:animate-pulse" />
                  <div className="h-4 w-16 shrink-0 rounded bg-surface-3 motion-safe:animate-pulse" />
                  <div className="size-8 shrink-0 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
