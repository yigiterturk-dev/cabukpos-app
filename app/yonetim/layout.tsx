import Link from "next/link";
import { ArrowRight, Bell, LogOut, Monitor, Store, TriangleAlert } from "lucide-react";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
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
  const activeStore = await withTenant(a.tenantId, async (tx) => {
    const id = await scopedStoreId(tx, a.tenantId);
    if (!id) return null;
    const [store] = await tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).where(eq(schema.stores.id, id)).limit(1);
    return store ?? null;
  });
  const bildirim = activeStore ? (await bildirimler(a.tenantId, activeStore.id)).length : 0;
  const brand = (dark: boolean) => (
    <Link href="/yonetim" className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
      <LogoMark size="sm" />
      <span className="min-w-0">
        <span className={`block font-display text-sm font-bold leading-tight tracking-tight ${dark ? "text-cream" : "text-ink"}`}>ÇabukPOS</span>
        <span className={`block truncate text-xs ${dark ? "text-cream-muted" : "text-muted"}`} title={`${a.tenantName} · ${a.vertical === "restoran" ? "Restoran" : "Market"}`}>{a.tenantName} · {a.vertical === "restoran" ? "Restoran" : "Market"}</span>
      </span>
    </Link>
  );
  const storeLink = (dark = false) => (
    <Link href="/yonetim/subeler" aria-label={activeStore ? `Aktif şube: ${activeStore.name}. Şubeleri yönet` : "Şube oluştur"} className={`inline-flex min-h-10 max-w-[112px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${dark ? "border-white/15 text-cream-muted hover:bg-white/5" : "border-line text-ink-2 hover:bg-surface-2"}`}>
      <Store aria-hidden className="size-3.5 shrink-0" /><span className="truncate">{activeStore?.name ?? "Şube oluştur"}</span>
    </Link>
  );
  const footer = (
    <div className="space-y-1 border-t border-white/10 pt-3">
      <Link href="/kasa" className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-cream-muted outline-none transition hover:bg-surface/5 hover:text-cream focus-visible:ring-4 focus-visible:ring-brand-ring/60">
        <Monitor aria-hidden className="size-4" />Kasa ekranı
      </Link>
      <div className="flex items-center gap-2 px-3 pt-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-cream" title={a.name}>{a.name}</span>
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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-pop focus-visible:ring-4 focus-visible:ring-brand-ring/60">İçeriğe geç</a>
      <PanelOffline />
      <aside className="relative hidden overflow-hidden bg-espresso print:hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:p-4 md:shadow-[inset_-1px_0_0_rgb(255_255_255/0.06)]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(224_90_16/0.16),transparent)]" />
        <div className="relative mb-4 border-b border-white/10 pb-4">{brand(true)}<div className="mt-3 px-1">{storeLink(true)}</div></div>
        <div className="relative min-h-0 flex-1 overflow-y-auto"><Nav vertical={a.vertical} /></div>
        <div className="relative pt-4">{footer}</div>
      </aside>
      <header className="sticky top-0 z-40 flex min-w-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 print:hidden md:hidden">
        <MobileNav>
          <div className="mb-5">{brand(true)}</div>
          <div className="flex-1"><Nav vertical={a.vertical} /></div>
          <div className="mt-5">{footer}</div>
        </MobileNav>
        {brand(false)}
        <div className="ml-auto flex items-center gap-2">
          {storeLink()}
          <ThemeToggle />
          <Link href="/yonetim/bildirimler" className="relative inline-flex size-11 items-center justify-center rounded-lg border border-line text-muted outline-none hover:text-ink hover:border-line-strong focus-visible:ring-4 focus-visible:ring-brand-ring/60" aria-label="Bildirimler">
            <Bell aria-hidden className="size-4" />
            {bildirim > 0 && <span data-testid="bildirim-sayi" className="absolute -right-1 -top-1 rounded-full bg-bad-action px-1.5 text-[10px] font-semibold text-white">{bildirim}</span>}
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="page-enter mx-auto min-w-0 w-full max-w-7xl px-4 py-6 outline-none md:px-8 md:py-8 print:max-w-none print:p-0">
        {a.billing.warn && (
          <div data-testid="billing-banner" role={a.billing.locked ? "alert" : "status"} className={`mb-6 rounded-[14px] border p-3 text-sm print:hidden ${a.billing.locked ? "border-bad/25 bg-bad-soft text-bad" : "border-warn/30 bg-warn-soft text-warn"}`}>
            <div className="flex flex-wrap items-start gap-3">
              <TriangleAlert aria-hidden className="size-5 shrink-0" />
              <p className="min-w-0 flex-1 break-words">{bannerText(a.billing)}</p>
              <Link href="/yonetim/abonelik" className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Abonelik <ArrowRight aria-hidden className="size-3.5" /></Link>
            </div>
          </div>
        )}
        {!a.emailVerified && (
          <div data-testid="verify-banner" className="mb-6 rounded-[14px] border border-warn/30 bg-warn-soft p-3 text-sm text-warn print:hidden">
            <span className="break-words">E-postanız doğrulanmadı. <Link href="/yonetim/guvenlik" className="rounded px-1 font-medium underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Doğrulayın</Link> — hesap kurtarmayı kolaylaştırır.</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
