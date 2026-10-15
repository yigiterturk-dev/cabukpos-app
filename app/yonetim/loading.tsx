export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Yönetim paneli yükleniyor" role="status">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-8 w-32 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
          <div className="h-4 w-64 max-w-[70vw] rounded bg-surface-3 motion-safe:animate-pulse" />
        </div>
        <div className="h-11 w-32 rounded-xl bg-surface-3 motion-safe:animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-32 rounded-2xl border border-line bg-surface motion-safe:animate-pulse" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-80 rounded-2xl border border-line bg-surface motion-safe:animate-pulse" />
        <div className="space-y-6">
          <div className="h-48 rounded-2xl border border-line bg-surface motion-safe:animate-pulse" />
          <div className="h-40 rounded-2xl border border-line bg-surface motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}
