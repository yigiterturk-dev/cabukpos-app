// Ortak UI parçaları (tasarım dili: docs/superpowers/specs/2026-09-29-cabukpos-arayuz-tasarim-dili-design.md).
// Native <select> kullanılmaz (bkz. components/Select.tsx).
import type { ComponentProps, ReactNode } from "react";

export { Dialog } from "./Dialog";
export { Segmented } from "./Segmented";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-rest ring-1 ring-inset ring-white/15 hover:bg-brand-hover hover:shadow-raised",
  secondary: "border border-line bg-surface text-ink shadow-rest hover:border-line-strong hover:bg-surface-2 hover:shadow-raised",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "border border-bad/25 bg-surface text-bad shadow-rest hover:bg-bad-soft hover:shadow-raised",
  success: "bg-ok text-white shadow-rest hover:bg-ok/90 hover:shadow-raised",
};
const SIZE: Record<Size, string> = {
  sm: "min-h-10 rounded-lg px-2.5 text-[13px]",
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
  const sq = { sm: "w-10", md: "w-10", lg: "w-12", xl: "w-16" }[size];
  return <button type="button" aria-label={label} title={label} {...p} className={`${buttonClass(variant, size)} ${sq} !px-0 ${className}`} />;
}

const FIELD = "min-h-11 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-brand-ring/50";

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

export function Card({ className = "", interactive = false, ...p }: ComponentProps<"div"> & { interactive?: boolean }) {
  const base = "min-w-0 rounded-2xl border border-line bg-surface";
  const rest = "shadow-rest";
  const lift = interactive
    ? "transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised"
    : "transition-shadow duration-[var(--dur-base)]";
  return <div {...p} className={`${base} ${rest} ${lift} ${className}`} />;
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="break-words font-display text-[26px] font-bold leading-tight tracking-[-0.02em] md:text-[30px]">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl break-words text-sm text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
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

export function Empty({ icon, action, children }: { icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2/40 p-10 text-center text-sm text-muted">
      {icon && <span className="text-line-strong [&>svg]:size-8">{icon}</span>}
      {children}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Marka işareti: kor turuncu kare içinde Ç. Tüm yüzeylerde aynı. */
export function LogoMark({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "size-7 rounded-lg text-sm", md: "size-9 rounded-[10px] text-base", lg: "size-14 rounded-2xl text-2xl" }[size];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center bg-brand font-display font-extrabold text-white shadow-rest ring-1 ring-inset ring-white/25 ${s} ${className}`}>Ç</span>
  );
}

/** Yönetim tablosu başlık satırı (thead) sınıfı: tüm listelerde aynı. */
export const TABLE_HEAD = "sticky top-0 z-10 border-b border-line bg-surface-2 text-left text-xs text-muted shadow-[0_1px_0_var(--color-line)]";

/** Liste-önce düzen: solda liste, geniş ekranda sağa yapışık form paneli; dar ekranda panel üstte. */
export function SplitView({ list, panel, wide = false }: { list: ReactNode; panel: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid gap-6 xl:items-start ${wide ? "xl:grid-cols-[minmax(0,1fr)_440px]" : "xl:grid-cols-[minmax(0,1fr)_380px]"}`}>
      <div className="order-2 min-w-0 xl:order-1">{list}</div>
      <aside className="order-1 xl:sticky xl:top-8 xl:order-2 xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:rounded-[14px]">{panel}</aside>
    </div>
  );
}

/** Yan paneldeki form kartı: başlık şeridi + gövde. `tone="edit"` düzenlemede marka kenarı. */
export function Panel({ title, desc, action, tone, children }: { title: string; desc?: ReactNode; action?: ReactNode; tone?: "edit"; children: ReactNode }) {
  return (
    <Card className={tone === "edit" ? "border-brand-ring ring-4 ring-brand-ring/30" : ""}>
      <div className={`flex items-start justify-between gap-3 border-b border-line px-5 py-3.5 ${tone === "edit" ? "bg-brand-soft/50" : "bg-surface-2/60"}`}>
        <div className="min-w-0">
          <h2 className="break-words font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 break-words text-xs text-muted">{desc}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

export type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "info";

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};

/** Özet/istatistik karosu: etiket üstte, tabular display rakam altta. Ciro, fiş sayısı vb. */
export function StatCard({ label, value, hint, icon, tone = "neutral", className = "" }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-rest ${className}`}>
      {icon && <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl [&>svg]:size-5 ${TONE_CHIP[tone]}`}>{icon}</span>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted" title={label}>{label}</p>
        <p className="tabular truncate font-display text-2xl font-bold leading-tight tracking-tight" title={typeof value === "string" ? value : undefined}>{value}</p>
        {hint && <p className="truncate text-xs text-muted" title={typeof hint === "string" ? hint : undefined}>{hint}</p>}
      </div>
    </div>
  );
}

/** Ana hub aksiyon karosu: büyük ikon çipi, başlık ve açıklama. Tümüyle dokunulur. */
export function ActionTile({ icon, title, desc, onClick, tone = "neutral", disabled = false, badge, className = "" }: {
  icon: ReactNode; title: string; desc?: string; onClick?: () => void; tone?: Tone; disabled?: boolean; badge?: ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-tone={tone}
      className={`press group flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-rest outline-none transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:pointer-events-none disabled:opacity-40 ${className}`}>
      <span aria-hidden className={`grid size-11 place-items-center rounded-xl [&>svg]:size-6 ${TONE_CHIP[tone]}`}>{icon}</span>
      <span className="min-w-0 max-w-full">
        <span className="flex min-w-0 flex-wrap items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span className="min-w-0 break-words">{title}</span>
          {badge && <span className="shrink-0">{badge}</span>}
        </span>
        {desc && <span className="mt-0.5 block break-words text-sm text-muted">{desc}</span>}
      </span>
    </button>
  );
}

/** Klavye kısayolu rozeti (ör. F2, Enter). */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">{children}</kbd>;
}
