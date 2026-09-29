// Ortak UI parçaları (tasarım dili: docs/superpowers/specs/2026-09-29-cabukpos-arayuz-tasarim-dili-design.md).
// Native <select> kullanılmaz (bkz. components/Select.tsx).
import type { ComponentProps, ReactNode } from "react";

export { Dialog } from "./Dialog";
export { Segmented } from "./Segmented";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-card hover:bg-brand-hover",
  secondary: "border border-line bg-white text-ink shadow-card hover:border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-3",
  danger: "border border-red-200 bg-white text-bad hover:bg-bad-soft",
  success: "bg-ok text-white shadow-card hover:bg-emerald-800",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 rounded-lg px-2.5 text-[13px]",
  md: "h-10 rounded-[10px] px-3.5 text-sm",
  lg: "h-12 rounded-xl px-4 text-[15px]",
  xl: "h-16 rounded-2xl px-5 text-lg font-semibold",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  return `press inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...p} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function IconButton({ label, variant = "ghost", size = "md", className = "", ...p }: ComponentProps<"button"> & { label: string; variant?: Variant; size?: Size }) {
  const sq = { sm: "w-8", md: "w-10", lg: "w-12", xl: "w-16" }[size];
  return <button type="button" aria-label={label} title={label} {...p} className={`${buttonClass(variant, size)} ${sq} !px-0 ${className}`} />;
}

const FIELD = "w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-brand focus:ring-4 focus:ring-brand-ring/50";

export function Input({ className = "", ...p }: ComponentProps<"input">) {
  return <input {...p} className={`${FIELD} ${className}`} />;
}

export function Textarea({ className = "", ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={`${FIELD} ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className = "", ...p }: ComponentProps<"div">) {
  return <div {...p} className={`rounded-[14px] border border-line bg-white shadow-card ${className}`} />;
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "brand"; children: ReactNode }) {
  const t = {
    neutral: "bg-surface-3 text-ink-2",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    brand: "bg-brand-soft text-brand",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-line-strong p-10 text-center text-sm text-muted">
      {icon && <span className="text-stone-300 [&>svg]:size-8">{icon}</span>}
      {children}
    </div>
  );
}
