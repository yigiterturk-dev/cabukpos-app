// Segment/sekme grubu. Öğe başına aria-pressed (sekme davranışı çağıranda).
import type { ReactNode } from "react";

export type SegmentItem = { key: string; label: ReactNode; pressed: boolean; onClick: () => void };

export function Segmented({ items, size = "md", className = "" }: { items: SegmentItem[]; size?: "md" | "lg"; className?: string }) {
  const h = size === "lg" ? "h-12 px-5 text-[15px]" : "min-h-11 px-4 text-sm";
  return (
    <div className={`inline-flex max-w-full overflow-x-auto rounded-xl bg-surface-3 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.05)] ${className}`}>
      {items.map((it) => (
        <button key={it.key} type="button" aria-pressed={it.pressed} onClick={it.onClick}
          className={`press inline-flex shrink-0 items-center gap-2 rounded-[9px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-4 focus-visible:ring-brand-ring/50 ${h} ${it.pressed ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
