// Ortak UI parçaları (tasarım dili: docs/superpowers/specs/2026-09-29-cabukpos-arayuz-tasarim-dili-design.md).
// Native <select> kullanılmaz (bkz. components/Select.tsx).
import type { ComponentProps, ReactNode } from "react";

export { Dialog } from "./Dialog";
export { Segmented } from "./Segmented";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  primary: "bg-gradient-to-b from-[#ee6318] to-[#d64f08] text-white shadow-card hover:from-[#e05a10] hover:to-[#bf4408] hover:shadow-glow",
  secondary: "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-surface-2 hover:shadow-pop",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "border border-bad/25 bg-surface text-bad shadow-card hover:bg-bad-soft hover:shadow-pop",
  success: "bg-gradient-to-b from-[#1d8a5a] to-[#14663f] text-white shadow-card hover:from-[#177245] hover:to-[#0f5634] hover:shadow-glow",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 rounded-lg px-2.5 text-[13px]",
  md: "h-10 rounded-[10px] px-3.5 text-sm",
  lg: "h-12 rounded-xl px-4 text-[15px]",
  xl: "h-16 rounded-2xl px-5 text-lg font-semibold",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  return `press inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...p} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function IconButton({ label, variant = "ghost", size = "md", className = "", ...p }: ComponentProps<"button"> & { label: string; variant?: Variant; size?: Size }) {
  const sq = { sm: "w-8", md: "w-10", lg: "w-12", xl: "w-16" }[size];
  return <button type="button" aria-label={label} title={label} {...p} className={`${buttonClass(variant, size)} ${sq} !px-0 ${className}`} />;
}

const FIELD = "min-h-11 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-stone-400 hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50";

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
  return <div {...p} className={`rounded-2xl border border-line bg-surface shadow-card transition-shadow duration-150 ${className}`} />;
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] md:text-[30px]">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "brand"; children: ReactNode }) {
  const t = {
    neutral: "bg-surface-3 text-ink-2 ring-line-strong/60",
    ok: "bg-ok-soft text-ok ring-ok/25",
    warn: "bg-warn-soft text-warn ring-warn/25",
    bad: "bg-bad-soft text-bad ring-bad/25",
    brand: "bg-brand-soft text-brand ring-brand/25",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${t}`}>{children}</span>;
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2/40 p-10 text-center text-sm text-muted">
      {icon && <span className="text-line-strong [&>svg]:size-8">{icon}</span>}
      {children}
    </div>
  );
}

/** Marka işareti: kor turuncu kare içinde Ç. Tüm yüzeylerde aynı. */
export function LogoMark({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "size-7 rounded-lg text-sm", md: "size-9 rounded-[10px] text-base", lg: "size-14 rounded-2xl text-2xl" }[size];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center bg-gradient-to-b from-[#ee6318] to-[#c2410c] font-display font-extrabold text-white shadow-glow ring-1 ring-inset ring-white/25 ${s} ${className}`}>Ç</span>
  );
}

/** Yönetim tablosu başlık satırı (thead) sınıfı: tüm listelerde aynı. */
export const TABLE_HEAD = "border-b border-line bg-surface-2 text-left text-xs text-muted";

/** Liste-önce düzen: solda liste, geniş ekranda sağa yapışık form paneli; dar ekranda panel üstte. */
export function SplitView({ list, panel, wide = false }: { list: ReactNode; panel: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid gap-6 lg:items-start ${wide ? "lg:grid-cols-[minmax(0,1fr)_440px]" : "lg:grid-cols-[minmax(0,1fr)_380px]"}`}>
      <div className="order-2 min-w-0 lg:order-1">{list}</div>
      <aside className="order-1 lg:sticky lg:top-8 lg:order-2 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:rounded-[14px]">{panel}</aside>
    </div>
  );
}

/** Yan paneldeki form kartı: başlık şeridi + gövde. `tone="edit"` düzenlemede marka kenarı. */
export function Panel({ title, desc, action, tone, children }: { title: string; desc?: ReactNode; action?: ReactNode; tone?: "edit"; children: ReactNode }) {
  return (
    <Card className={tone === "edit" ? "border-brand-ring ring-4 ring-brand-ring/30" : ""}>
      <div className={`flex items-start justify-between gap-3 border-b border-line px-5 py-3.5 ${tone === "edit" ? "bg-brand-soft/50" : "bg-surface-2/60"}`}>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}
