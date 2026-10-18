"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ActionResult({ kind, className, children }: { kind: "success" | "error"; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => ref.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={`outline-none focus-visible:ring-4 print:hidden ${className ?? `mb-6 rounded-[14px] border px-4 py-3 text-sm ${kind === "error" ? "border-bad/30 bg-bad-soft text-bad" : "border-ok/30 bg-ok-soft text-ok"}`} ${kind === "error" ? "focus-visible:ring-bad/30" : "focus-visible:ring-ok/30"}`}
    >
      {children}
    </div>
  );
}
