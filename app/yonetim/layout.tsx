import Link from "next/link";
import { LogOut, Monitor } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { bannerText } from "@/lib/core/billing";
import { logout } from "@/lib/auth/actions";
import { LogoMark } from "@/components/ui";
import { MobileNav, Nav } from "./Nav";

export default async function YonetimLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const brand = (
    <Link href="/yonetim" className="flex items-center gap-2.5 px-1">
      <LogoMark size="sm" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">ÇabukPOS</span>
        <span className="block truncate text-xs text-muted">{a.tenantName} · {a.vertical === "restoran" ? "Restoran" : "Market"}</span>
      </span>
    </Link>
  );
  const footer = (
    <div className="space-y-1 border-t border-line pt-3">
      <Link href="/kasa" className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-2 outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">
        <Monitor aria-hidden className="size-4 text-muted" />Kasa ekranı
      </Link>
      <div className="flex items-center gap-2 px-3 pt-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
        <form action={logout}>
          <button className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">
            <LogOut aria-hidden className="size-3.5" />Çıkış
          </button>
        </form>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh bg-surface-2 md:grid md:grid-cols-[232px_1fr] print:block print:bg-white">
      <aside className="hidden border-r border-line bg-white print:hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6 md:p-4">
        {brand}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"><Nav vertical={a.vertical} /></div>
        {footer}
      </aside>
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-line bg-white px-3 py-2 print:hidden md:hidden">
        <MobileNav>
          <div className="mb-5">{brand}</div>
          <div className="flex-1"><Nav vertical={a.vertical} /></div>
          <div className="mt-5">{footer}</div>
        </MobileNav>
        {brand}
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">
        {a.billing.warn && (
          <div data-testid="billing-banner" className={`mb-6 rounded-[14px] border p-3 text-sm print:hidden ${a.billing.locked ? "border-red-200 bg-bad-soft text-bad" : "border-amber-200 bg-warn-soft text-warn"}`}>
            {bannerText(a.billing)} <Link href="/yonetim/abonelik" className="font-medium underline">Abonelik</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
