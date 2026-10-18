"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function CampaignSendResult({ kind, testId, children }: { kind: "success" | "error"; testId: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      data-testid={testId}
      className={`mb-6 rounded-[14px] border p-3 text-sm outline-none focus-visible:ring-4 print:hidden ${kind === "error" ? "border-bad/25 bg-bad-soft text-bad focus-visible:ring-bad/30" : "border-ok/25 bg-ok-soft text-ok focus-visible:ring-ok/30"}`}
    >
      {children}
    </div>
  );
}
