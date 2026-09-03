"use client";

import { STATUS_META } from "@/lib/utils";
import type { Staff } from "@/lib/types";

export function StatusChip({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const m = STATUS_META[status] ?? STATUS_META.bekliyor;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${m.chip} ${m.text} ${
        size === "xs" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function StaffAvatar({ staff, size = 32 }: { staff: Staff; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: staff.color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {staff.initials}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div>
      <h1 className="font-display text-[22px] font-700 tracking-tight text-ink">{children}</h1>
      {sub && <p className="mt-0.5 text-[13.5px] text-muted">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</div>
  );
}
