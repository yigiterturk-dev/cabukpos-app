import Link from "next/link";
import { Bell, LogOut, Monitor } from "lucide-react";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { bannerText } from "@/lib/core/billing";
import { bildirimler } from "@/lib/admin/bildirim";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { logout } from "@/lib/auth/actions";
import { LogoMark } from "@/components/ui";
import { PanelOffline } from "@/components/yonetim/panel-offline";
import { MobileNav, Nav } from "./Nav";
import { ThemeToggle } from "@/components/admin/Preferences";

export default async function YonetimLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const scoped = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  const bildirim = scoped ? (await bildirimler(a.tenantId, scoped)).length : 0;
  const brand = (dark: boolean) => (
    <Link href="/yonetim" className="flex items-center gap-2.5 px-1">
      <LogoMark size="sm" />
      <span className="min-w-0">
        <span className={`block font-display text-sm font-bold leading-tight tracking-tight ${dark ? "text-cream" : "text-ink"}`}>ÇabukPOS</span>
        <span className={`block truncate text-xs ${dark ? "text-cream-muted" : "text-muted"}`}>{a.tenantName} · {a.vertical === "restoran" ? "Restoran" : "Market"}</span>
      </span>
    </Link>
  );
  const footer = (
    <div className="space-y-1 border-t border-white/10 pt-3">
      <Link href="/kasa" className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-cream-muted outline-none transition hover:bg-surface/5 hover:text-cream focus-visible:ring-4 focus-visible:ring-brand-ring/60">
        <Monitor aria-hidden className="size-4" />Kasa ekranı
      </Link>
      <div className="flex items-center gap-2 px-3 pt-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-cream">{a.name}</span>
        <form action={logout}>
          <button className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-cream-muted outline-none transition hover:bg-surface/5 hover:text-cream focus-visible:ring-4 focus-visible:ring-brand-ring/60">
            <LogOut aria-hidden className="size-3.5" />Çıkış
          </button>
        </form>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh bg-canvas md:grid md:grid-cols-[232px_1fr] print:block print:bg-white">
      <PanelOffline />
      <aside className="hidden bg-espresso print:hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6 md:p-4 md:shadow-[inset_-1px_0_0_rgb(255_255_255/0.06)]">
        {brand(true)}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"><Nav vertical={a.vertical} /></div>
        {footer}
      </aside>
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-line bg-surface px-3 py-2 print:hidden md:hidden">
        <MobileNav>
          <div className="mb-5">{brand(true)}</div>
          <div className="flex-1"><Nav vertical={a.vertical} /></div>
          <div className="mt-5">{footer}</div>
        </MobileNav>
        {brand(false)}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/yonetim/bildirimler" className="relative inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted hover:text-ink hover:border-line-strong" aria-label="Bildirimler">
            <Bell aria-hidden className="size-4" />
            {bildirim > 0 && <span data-testid="bildirim-sayi" className="absolute -right-1 -top-1 rounded-full bg-bad px-1.5 text-[10px] font-semibold text-white">{bildirim}</span>}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">
        {a.billing.warn && (
          <div data-testid="billing-banner" className={`mb-6 rounded-[14px] border p-3 text-sm print:hidden ${a.billing.locked ? "border-red-200 bg-bad-soft text-bad" : "border-amber-200 bg-warn-soft text-warn"}`}>
            {bannerText(a.billing)} <Link href="/yonetim/abonelik" className="font-medium underline">Abonelik</Link>
          </div>
        )}
        {!a.emailVerified && (
          <div data-testid="verify-banner" className="mb-6 rounded-[14px] border border-amber-200 bg-warn-soft p-3 text-sm text-warn print:hidden">
            E-postanız doğrulanmadı. <Link href="/yonetim/guvenlik" className="font-medium underline">Doğrulayın</Link> — hesap kurtarmayı kolaylaştırır.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
