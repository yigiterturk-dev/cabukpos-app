import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { NavLeaf } from "../nav-data";

export function HubCards({ items }: { items: NavLeaf[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ href, label, desc, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="press group flex min-h-24 items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-rest outline-none transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60"
        >
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
              <span className="min-w-0 break-words">{label}</span>
              <ArrowRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-1 block break-words text-sm leading-5 text-muted">{desc}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function HubBar({ items }: { items: NavLeaf[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Bölüm sayfaları" className="mb-5 flex flex-wrap gap-2">
      {items.map(({ href, label }) => (
        <Link key={href} href={href} className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink-2 outline-none transition hover:border-line-strong hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">
          {label}
        </Link>
      ))}
    </nav>
  );
}
