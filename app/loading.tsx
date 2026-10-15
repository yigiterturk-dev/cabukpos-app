import { LogoMark } from "@/components/ui";

export default function Loading() {
  return (
    <main className="grid min-h-svh place-items-center bg-canvas px-6" aria-busy="true" aria-label="ÇabukPOS yükleniyor" role="status">
      <div className="flex flex-col items-center gap-4 text-center">
        <LogoMark size="lg" />
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">ÇabukPOS</p>
          <p className="mt-1 text-sm text-muted">Ekran hazırlanıyor…</p>
        </div>
        <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full w-1/2 rounded-full bg-brand motion-safe:animate-pulse" />
        </span>
      </div>
    </main>
  );
}
