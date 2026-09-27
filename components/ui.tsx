// Ortak küçük UI parçaları. Native <select> kullanılmaz (bkz. components/Select.tsx).
import type { ComponentProps, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-brand text-white hover:bg-orange-800",
    ghost: "border border-line bg-white hover:bg-stone-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${v} ${className}`} />;
}

export function Input({ className = "", ...p }: ComponentProps<"input">) {
  return <input {...p} className={`w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-orange-100 ${className}`} />;
}

export function Textarea({ className = "", ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={`w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-orange-100 ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className = "", ...p }: ComponentProps<"div">) {
  return <div {...p} className={`rounded-xl border border-line bg-white ${className}`} />;
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "brand"; children: ReactNode }) {
  const t = {
    neutral: "bg-stone-100 text-stone-700",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-800",
    bad: "bg-red-50 text-red-700",
    brand: "bg-brand-soft text-brand",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">{children}</div>;
}
