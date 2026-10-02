// Masa planı grafiği: masa + 4 sandalye (çizgi, currentColor).
export function MasaGlyph({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden className={className}>
      <rect x="15" y="15" width="18" height="18" rx="4.5" />
      <path d="M20 9.5v-2.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 28 7v2.5" />
      <path d="M20 38.5V41a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 28 41v-2.5" />
      <path d="M9.5 20H7a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 7 28h2.5" />
      <path d="M38.5 20H41a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 41 28h-2.5" />
    </svg>
  );
}
