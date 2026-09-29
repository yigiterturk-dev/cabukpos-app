// Segment/sekme grubu. Öğe başına aria-pressed (sekme davranışı çağıranda).
import type { ReactNode } from "react";

export type SegmentItem = { key: string; label: ReactNode; pressed: boolean; onClick: () => void };

export function Segmented({ items, size = "md", className = "" }: { items: SegmentItem[]; size?: "md" | "lg"; className?: string }) {
  const h = size === "lg" ? "h-11 px-5 text-[15px]" : "h-9 px-4 text-sm";
  return (
    <div className={`inline-flex rounded-xl bg-surface-3 p-1 ${className}`}>
      {items.map((it) => (
        <button key={it.key} type="button" aria-pressed={it.pressed} onClick={it.onClick}
          className={`press inline-flex items-center gap-2 rounded-[9px] font-medium whitespace-nowrap ${h} ${it.pressed ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
