"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { SECTORS } from "@/lib/sectors";
import { prettyDate, todayISO } from "@/lib/utils";
import type { SectorId } from "@/lib/types";
import { logoutAction } from "@/lib/auth/actions";
import { disableDemoMode } from "@/lib/auth/mode";
import {
  IcGrid, IcCalendar, IcUsers, IcStaff, IcSettings,
  IcReport, IcMegaphone, IcBell, IcCard, IcLink, IcScissors, IcMore, IcWallet,
  IcBarcode, IcKitchen,
} from "@/components/icons";

type NavItem = { href: string; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; sectors?: SectorId[] };

const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Genel Bakış", Icon: IcGrid },
      { href: "/hizli-kasa", label: "Hızlı Kasa", Icon: IcBarcode, sectors: ["restoran", "kafe", "market", "pastane"] },
      { href: "/masalar", label: "Masalar", Icon: IcCalendar, sectors: ["restoran", "kafe", "pastane"] },
      { href: "/mutfak", label: "Sipariş Ekranı", Icon: IcKitchen, sectors: ["restoran", "kafe", "pastane"] },
      { href: "/hesaplar", label: "Hesaplar", Icon: IcUsers },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/kasa", label: "Kasa & Cari", Icon: IcWallet },
      { href: "/urunler", label: "Ürünler", Icon: IcScissors },
      { href: "/personel", label: "Personel & Prim", Icon: IcStaff },
      { href: "/raporlar", label: "Raporlar", Icon: IcReport },
    ],
  },
  {
    title: "Büyüme",
    items: [
      { href: "/kampanyalar", label: "Kampanyalar", Icon: IcMegaphone },
      { href: "/hatirlatma", label: "Hatırlatma", Icon: IcBell },
      { href: "/entegrasyonlar", label: "Entegrasyonlar", Icon: IcLink, sectors: ["restoran", "kafe", "market", "pastane"] },
      { href: "/rezervasyon", label: "Online Sipariş", Icon: IcMore },
      { href: "/abonelik", label: "Abonelik", Icon: IcCard },
    ],
  },
];

// Mobil hızlı erişim (4 ikon); kalan tüm sayfalar "Menü" açılırında listelenir.
const MOBILE_QUICK = [
  { href: "/dashboard", Icon: IcGrid },
  { href: "/masalar", Icon: IcCalendar },
  { href: "/hesaplar", Icon: IcUsers },
  { href: "/kasa", Icon: IcWallet },
];


export function Shell({ children }: { children: React.ReactNode }) {
  const { state, ready, hasSetup, resetAll, mode } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const isDb = mode === "db";

  async function onLogout() {
    await logoutAction();
    // Tam yenileme → root layout yeniden çalışır, mod "none"/"demo" olur, middleware /giris'e atar.
    window.location.href = "/giris";
  }

  async function onExitDemo() {
    // Demo verisini bırak, kayda yönlendir (satış demosundan dönüşüm akışı).
    resetAll();
    await disableDemoMode();
    window.location.href = "/kayit";
  }

  useEffect(() => {
    if (ready && !hasSetup) router.replace("/");
  }, [ready, hasSetup, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
      </div>
    );
  }
  if (!hasSetup) return null;

  const sector = state.sector ? SECTORS[state.sector] : null;

  // Onay bekleyen online talep sayısı — "Genel Bakış" nav'ında kırmızı rozet (0 ise gösterilmez).
  const pendingCount = state.appointments.filter((a) => a.approval === "bekliyor").length;

  // Sektör-koşullu nav: item.sectors tanımlıysa sadece o sektörlerde göster.
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.sectors || (state.sector !== null && it.sectors.includes(state.sector))),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sol nav */}
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <Link href="/dashboard" className="mb-7 flex items-center gap-2.5 px-2">
          <Logo />
          <span className="font-display text-[19px] font-700 tracking-tight text-ink">Çabuk POS</span>
        </Link>

        <nav className="flex flex-col gap-4 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {group.title && (
                <div className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted/70">
                  {group.title}
                </div>
              )}
              {group.items.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ${
                      active ? "bg-brand-soft text-brand-deep" : "text-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon className={`h-[17px] w-[17px] ${active ? "text-brand" : "text-muted group-hover:text-ink"}`} />
                    {label}
                    {href === "/dashboard" && pendingCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1.5 text-[11px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">İşletme</div>
            <div className="mt-0.5 truncate text-[14px] font-semibold text-ink">{state.businessName}</div>
            {sector && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {sector.label}
              </div>
            )}
          </div>
          {isDb ? (
            // DB modu: giriş yapılmış → Çıkış.
            <button
              onClick={onLogout}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <IcSettings className="h-[16px] w-[16px]" />
              Çıkış
            </button>
          ) : (
            // Demo modu: sektör değiştir + kaydol CTA.
            <>
              <button
                onClick={() => {
                  if (confirm("Tüm demo veri sıfırlansın ve sektör seçim ekranına dönülsün mü?")) {
                    resetAll();
                    router.replace("/");
                  }
                }}
                className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <IcSettings className="h-[16px] w-[16px]" />
                Sektörü değiştir
              </button>
              <button
                onClick={onExitDemo}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                Demo — kaydol
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-line bg-surface/85 px-5 backdrop-blur-md lg:px-7">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <Logo />
              <span className="font-display text-[16px] font-700">Çabuk POS</span>
            </Link>
            <span className="hidden text-[13px] font-medium text-muted sm:inline">{prettyDate(todayISO())}</span>
            {!isDb && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] font-semibold text-amber">
                Demo modu
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDb && state.businessName && (
              <span className="hidden max-w-[180px] truncate text-[13px] font-medium text-ink sm:inline">
                {state.businessName}
              </span>
            )}
            <MobileNav pathname={pathname} items={navGroups.flatMap((g) => g.items)} pendingCount={pendingCount} />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
              {state.businessName.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-7 lg:py-7">{children}</main>
      </div>
    </div>
  );
}

function MobileNav({ pathname, items, pendingCount }: { pathname: string; items: NavItem[]; pendingCount: number }) {
  const [open, setOpen] = useState(false);

  // Açılır menüde tüm sayfalar; hızlı barda zaten görünenleri de göster (tek tıkla erişim).
  const quickHrefs = new Set(MOBILE_QUICK.map((q) => q.href));
  const quick = MOBILE_QUICK.filter((q) => items.some((it) => it.href === q.href));

  // Sayfa değişince menüyü kapat
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="relative lg:hidden">
      <div className="flex items-center gap-0.5 rounded-full border border-line bg-canvas p-1">
        {quick.map(({ href, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                active ? "bg-brand text-white" : "text-muted"
              }`}
            >
              <Icon className="h-[17px] w-[17px]" />
              {href === "/dashboard" && pendingCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[9.5px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Tüm sayfalar"
          aria-expanded={open}
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            open || !quickHrefs.has(pathname) ? "bg-brand text-white" : "text-muted"
          }`}
        >
          <IcMore className="h-[17px] w-[17px]" />
        </button>
      </div>

      {open && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
            <div className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted/70">Tüm sayfalar</div>
            {items.map(({ href, label, Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
                    active ? "bg-brand-soft text-brand-deep" : "text-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  <Icon className={`h-[17px] w-[17px] ${active ? "text-brand" : "text-muted"}`} />
                  {label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Logo() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand to-mint text-white shadow-sm">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M8 2.5v3M16 2.5v3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" fill="#fff" fillOpacity="0.96" />
        <path d="M3.5 9.5h17" stroke="#1B7A5A" strokeWidth="1.3" strokeOpacity="0.3" />
        <path d="M8.4 14.6l2.4 2.4 4.8-4.8" stroke="#1B7A5A" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
