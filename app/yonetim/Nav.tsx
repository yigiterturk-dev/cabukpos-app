"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { normalizeSearchText } from "@/lib/core/search";
import { Armchair, ArrowLeftRight, Bell, Boxes, Building2, CalendarClock, ChartColumn, ChefHat, ChevronDown, Contact, CookingPot, CreditCard, Flame, Gift, Globe, Handshake, LayoutDashboard, MapPin, Menu, Database, MonitorSmartphone, Package, PackagePlus, Percent, Plug, Printer, Receipt, Search, ShieldCheck, SlidersHorizontal, Star, Store, Tag, Ticket, TrendingUp, UserCog, Warehouse, X, Clock, ClipboardList, CircleHelp, type LucideIcon, Settings } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; only?: "restoran" | "market"; exact?: boolean; minStores?: number; allStores?: boolean; badge?: number };
const groups: { title: string; items: Item[] }[] = [
  { title: "Genel", items: [
    { href: "/yonetim", label: "Bugün", icon: LayoutDashboard, exact: true },
    { href: "/yonetim/bildirimler", label: "Bildirimler", icon: Bell },
    { href: "/yonetim/raporlar", label: "Raporlar", icon: ChartColumn },
    { href: "/yonetim/tercihler", label: "Tercihler", icon: Settings },
    { href: "/yonetim/yardim", label: "Yardım ve kurulum", icon: CircleHelp },
  ] },
  { title: "Menü", items: [
    { href: "/yonetim/urunler", label: "Ürünler", icon: Package },
    { href: "/yonetim/fiyatlistesi", label: "Fiyat listeleri", icon: Clock },
    { href: "/yonetim/secenekler", label: "Seçenekler", icon: SlidersHorizontal, only: "restoran" },
    { href: "/yonetim/receteler", label: "Reçeteler", icon: ChefHat, only: "restoran" },
    { href: "/yonetim/uretim", label: "Üretim", icon: CookingPot, only: "restoran" },
    { href: "/yonetim/etiketler", label: "Raf etiketi", icon: Tag },
  ] },
  { title: "Stok", items: [
    { href: "/yonetim/stok", label: "Stok", icon: Boxes },
    { href: "/yonetim/sayim", label: "Sayım & zayi", icon: ClipboardList },
    { href: "/yonetim/alislar", label: "Alışlar", icon: PackagePlus },
    { href: "/yonetim/tedarikciler", label: "Tedarikçiler", icon: Handshake },
    { href: "/yonetim/transferler", label: "Transferler", icon: ArrowLeftRight, minStores: 2 },
    { href: "/yonetim/depo", label: "Merkez depo", icon: Warehouse, allStores: true },
  ] },
  { title: "Satış kanalları", items: [
    { href: "/yonetim/salon", label: "Salon", icon: Armchair, only: "restoran" },
    { href: "/yonetim/rezervasyonlar", label: "Rezervasyon", icon: CalendarClock, only: "restoran" },
    { href: "/yonetim/istasyonlar", label: "İstasyonlar", icon: Flame, only: "restoran" },
    { href: "/yonetim/bolgeler", label: "Bölgeler", icon: MapPin, only: "restoran" },
    { href: "/yonetim/platform-hesap", label: "Platform hakedişi", icon: Receipt, only: "restoran" },
    { href: "/yonetim/partiler", label: "Parti / SKT", icon: Receipt },
    { href: "/yonetim/tedarik", label: "Tedarik siparişleri", icon: Receipt },
    { href: "/yonetim/devam", label: "Personel giriş / çıkış", icon: CalendarClock },
    { href: "/yonetim/kurye-hesap", label: "Kurye hesabı", icon: Receipt, only: "restoran" },
    { href: "/yonetim/musteriler", label: "Müşteriler", icon: Contact, only: "restoran", allStores: true },
    { href: "/yonetim/buyume", label: "Büyüme Merkezi", icon: TrendingUp, only: "restoran" },
    { href: "/yonetim/platformlar", label: "Platformlar", icon: Globe, only: "restoran" },
    { href: "/yonetim/markalar", label: "Markalar", icon: Store, only: "restoran" },
  ] },
  { title: "Sadakat", items: [
    { href: "/yonetim/sadakat", label: "Puan programı", icon: Star, allStores: true },
    { href: "/yonetim/kuponlar", label: "Kuponlar", icon: Ticket, allStores: true },
    { href: "/yonetim/hediyekarti", label: "Hediye kartı", icon: Gift, allStores: true },
  ] },
  { title: "İşletme", items: [
    { href: "/yonetim/subeler", label: "Şubeler", icon: Building2, allStores: true },
    { href: "/yonetim/hq", label: "Zincir merkezi", icon: ChartColumn, minStores: 2, allStores: true },
    { href: "/yonetim/personel", label: "Personel", icon: UserCog },
    { href: "/yonetim/personel-plan", label: "Personel planı", icon: CalendarClock },
    { href: "/yonetim/cihazlar", label: "Cihazlar", icon: MonitorSmartphone },
    { href: "/yonetim/donanim", label: "Donanım", icon: Printer },
    { href: "/yonetim/mali", label: "Mali", icon: Receipt, allStores: true },
    { href: "/yonetim/franchise", label: "Franchise", icon: Percent, allStores: true },
    { href: "/yonetim/veriler", label: "Veriler", icon: Database, allStores: true },
    { href: "/yonetim/denetim", label: "Denetim", icon: ShieldCheck, allStores: true },
    { href: "/yonetim/entegrasyonlar", label: "Entegrasyonlar", icon: Plug, allStores: true },
    { href: "/yonetim/abonelik", label: "Abonelik", icon: CreditCard, allStores: true },
    { href: "/yonetim/kullanicilar", label: "Kullanıcılar", icon: UserCog, allStores: true },
  ] },
];

/** Günlük görünüm: işletmecinin her gün baktıkları, işletme türü filtresiyle birlikte. Sıra bu listedeki sıra. */
const GUNLUK = ["/yonetim", "/yonetim/salon", "/yonetim/urunler", "/yonetim/stok", "/yonetim/raporlar", "/yonetim/personel", "/yonetim/yardim"];

const NAV_MODE_KEY = "cabukpos:nav";
const navModeListeners = new Set<() => void>();
const subscribeNavMode = (fn: () => void) => { navModeListeners.add(fn); return () => { navModeListeners.delete(fn); }; };
const getAllMode = (): boolean => { try { return window.localStorage.getItem(NAV_MODE_KEY) === "tumu"; } catch { return false; } };
const getServerAllMode = () => false;

function NavItem({ item, path, onSelect }: { item: Item; path: string; onSelect?: () => void }) {
  const on = item.exact ? path === item.href : path.startsWith(item.href);
  const Icon = item.icon;
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: "nearest" });
  }, [on, path]);
  return (
    <Link
      ref={ref}
      href={item.href}
      onClick={onSelect}
      aria-current={on ? "page" : undefined}
      data-testid={`nav-${item.href.replaceAll("/", "-").replace(/^-/, "root")}`}
      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none transition-[background-color,color,box-shadow] focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "bg-white/[0.1] font-semibold text-cream shadow-rest ring-1 ring-inset ring-white/10" : "font-medium text-cream-muted hover:bg-white/[0.06] hover:text-cream"}`}
    >
      <Icon aria-hidden className={`size-[18px] shrink-0 ${on ? "text-brand" : "text-cream-muted/80 group-hover:text-cream"}`} />
      <span className="truncate">{item.label}</span>
      {item.badge ? <span aria-label={`${item.badge} açık adisyon`} className="ml-auto min-w-5 shrink-0 rounded-full bg-brand-action px-1.5 text-center text-[10px] font-semibold leading-5 text-white">{item.badge > 99 ? "99+" : item.badge}</span> : on && <span aria-hidden className="ml-auto size-1.5 shrink-0 rounded-full bg-brand-action" />}
    </Link>
  );
}

function GroupLabel({ children, open, onToggle }: { children: React.ReactNode; open?: boolean; onToggle?: () => void }) {
  const cls = "text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-muted";
  if (!onToggle) return <h2 className={`mb-1.5 px-3 ${cls}`}>{children}</h2>;
  return (
    <h2>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 outline-none transition-[background-color,color,box-shadow] hover:text-cream focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${cls}`}
      >
        {children}
        <ChevronDown aria-hidden className={`size-3.5 shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
    </h2>
  );
}

/** Sidebar menüsü: arama ile filtrele + gruplu liste. Masaüstü ve mobil çekmecede aynı. */
export function Nav({ vertical, storeCount, allStores, openTabs = 0, onNavigate: onNavigateProp }: { vertical: "restoran" | "market"; storeCount: number; allStores: boolean; openTabs?: number; onNavigate?: () => void }) {
  const drawerClose = useContext(DrawerCloseContext);
  const onNavigate = onNavigateProp ?? drawerClose ?? undefined;
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [matchNotice, setMatchNotice] = useState<{ query: string; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLocaleLowerCase() === "k") {
        const target = e.target;
        const active = document.activeElement;
        const typing = target instanceof HTMLElement && (
          target.isContentEditable ||
          target.matches("input, textarea, select")
        );
        const modal = document.querySelector<HTMLElement>('[aria-modal="true"]');
        if (e.repeat || (modal && !modal.contains(searchRef.current)) || (typing && active !== searchRef.current)) return;
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const visible = useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter((i) => (!i.only || i.only === vertical) && (!i.minStores || storeCount >= i.minStores) && (!i.allStores || allStores)).map((i) => (i.href === "/yonetim/salon" ? { ...i, badge: openTabs } : i)) })).filter((g) => g.items.length),
    [vertical, storeCount, allStores, openTabs],
  );
  // Varsayılan görünüm "Günlük işler": yeni işletmeci paneli açtığında yalnız her gün baktığı sayfaları görür.
  // Seçim kalıcıdır (localStorage); arama her iki görünümde de bütün menüyü tarar.
  const allMode = useSyncExternalStore(subscribeNavMode, getAllMode, getServerAllMode);
  const [modeNotice, setModeNotice] = useState("");
  const setMode = (all: boolean) => {
    try { window.localStorage.setItem(NAV_MODE_KEY, all ? "tumu" : "gunluk"); } catch { /* yok say */ }
    for (const fn of navModeListeners) fn();
    setModeNotice(all ? "Tüm menü gösteriliyor." : "Günlük işler gösteriliyor.");
  };
  const flat = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  const gunlukItems = useMemo(() => GUNLUK.map((h) => flat.find((i) => i.href === h)).filter((i): i is Item => Boolean(i)), [flat]);
  const activeItem = flat.find((i) => (i.exact ? path === i.href : path.startsWith(i.href)));
  const activeGroupTitle = useMemo(() => (activeItem ? visible.find((g) => g.items.includes(activeItem))?.title : undefined), [visible, activeItem]);
  const shown = useMemo(() => {
    if (allMode) return visible;
    const out: { title: string; items: Item[] }[] = [];
    if (activeItem && !gunlukItems.includes(activeItem)) out.push({ title: "Bulunduğun sayfa", items: [activeItem] });
    out.push({ title: "Günlük işler", items: gunlukItems });
    return out;
  }, [allMode, visible, gunlukItems, activeItem]);
  const needle = normalizeSearchText(q.trim());
  const matches = needle ? flat.filter((i) => normalizeSearchText(i.label).includes(needle)) : [];
  // Tümü görünümü katlanabilir ağaçtır: gruplar kapalı durur, yalnız ilgili olan açılır (ihtiyaç anında çıkarılır).
  // Açıklık durumu türetilir: kullanıcının açtıkları + her zaman aktif sayfanın grubu (effect'siz, SSR tutarlı).
  const [manualOpen, setManualOpen] = useState<string[]>([]);
  const toggleGroup = (title: string) => setManualOpen((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));
  const isGroupOpen = (title: string) => manualOpen.includes(title) || title === activeGroupTitle;
  useEffect(() => {
    if (!needle) return;
    const timer = window.setTimeout(() => setMatchNotice({ query: needle, text: matches.length === 0 ? "Menüde sonuç yok." : `${matches.length} menü sonucu bulundu.` }), 450);
    return () => window.clearTimeout(timer);
  }, [matches.length, needle]);

  return (
    <nav aria-label="Yönetim" className="space-y-1">
      <div className="relative mb-3">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream-muted/70" />
        <input
          ref={searchRef}
          value={q}
          maxLength={80}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); }
            else if (e.key === "Enter" && matches[0]) { e.preventDefault(); router.push(matches[0].href); setQ(""); e.currentTarget.blur(); onNavigate?.(); }
          }}
          placeholder="Menüde ara"
          aria-label="Menüde ara"
          aria-keyshortcuts="Control+K Meta+K"
          className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-9 pr-8 text-sm text-cream placeholder:text-cream-muted outline-none transition focus:border-brand-ring/60 focus:bg-white/[0.09] focus:ring-4 focus:ring-brand-ring/25"
        />
        {!q && <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-cream-muted">⌘/Ctrl K</span>}
        {q && (
          <button type="button" aria-label="Aramayı temizle" onClick={() => { setQ(""); requestAnimationFrame(() => searchRef.current?.focus()); }} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-cream-muted outline-none hover:bg-white/10 hover:text-cream focus-visible:ring-2 focus-visible:ring-brand-ring/60">
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {matchNotice?.query === needle ? matchNotice.text : modeNotice}
      </p>

      <div role="group" aria-label="Menü görünümü" className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.06] p-1">
        <button
          type="button"
          aria-pressed={!allMode}
          onClick={() => setMode(false)}
          className={`min-h-9 rounded-lg px-2 py-1.5 text-xs outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-brand-ring/60 ${!allMode ? "bg-white/[0.12] font-semibold text-cream shadow-rest" : "font-medium text-cream-muted hover:text-cream"}`}
        >
          Günlük
        </button>
        <button
          type="button"
          aria-pressed={allMode}
          onClick={() => setMode(true)}
          className={`min-h-9 rounded-lg px-2 py-1.5 text-xs outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-brand-ring/60 ${allMode ? "bg-white/[0.12] font-semibold text-cream shadow-rest" : "font-medium text-cream-muted hover:text-cream"}`}
        >
          Tümü
        </button>
      </div>

      {needle ? (
        <ul className="space-y-0.5">
          {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-cream-muted">Sonuç yok</li>}
          {matches.map((i) => <li key={i.href}><NavItem item={i} path={path} onSelect={() => { setQ(""); onNavigate?.(); }} /></li>)}
        </ul>
      ) : (
        <div className="space-y-5">
          {shown.map((g) => {
            const collapsible = allMode && g.title !== "Bulunduğun sayfa";
            const open = !collapsible || isGroupOpen(g.title);
            return (
              <div key={g.title}>
                <GroupLabel open={open} onToggle={collapsible ? () => toggleGroup(g.title) : undefined}>{g.title}</GroupLabel>
                {open && (
                  <ul className="space-y-0.5">
                    {g.items.map((i) => <li key={i.href}><NavItem item={i} path={path} onSelect={() => { setQ(""); onNavigate?.(); }} /></li>)}
                  </ul>
                )}
              </div>
            );
          })}
          {!allMode && <p className="px-3 text-[11px] leading-relaxed text-cream-muted">Aradığın sayfa burada yok mu? Yukarıda aramayı dene ya da “Tümü”ne geç.</p>}
        </div>
      )}
    </nav>
  );
}

/** Mobil: üst çubuktaki düğme + soldan çekmece. Rota değişince kapanır.
 *  children düz elemandır (RSC sınırında fonksiyon children serileştirilemez — E2E provasında yakalandı);
 *  çekmece kapatma çağrısı context ile iner, Nav kendi kendine alır. */
const DrawerCloseContext = createContext<(() => void) | null>(null);

export function MobileNav({ children }: { children: React.ReactNode }) {
  // Açıldığı rotayı tutar: rota değişince kendiliğinden kapalı sayılır (efektte setState yok).
  const path = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const previousPath = useRef(path);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  const close = () => setOpenAt(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 48rem)");
    const closeOnDesktop = () => { if (desktop.matches) setOpenAt(null); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (previousPath.current === path) return;
    previousPath.current = path;
    document.getElementById("main-content")?.focus();
  }, [path]);
  useEffect(() => {
    if (open) {
      const previousOverflow = document.body.style.overflow;
      const previousPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        const currentPadding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
        document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
      // Put keyboard users directly into the navigation task; keep the close
      // button reachable first in DOM order when they move backwards.
      const firstNavigationItem = [...(drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].find((item) => item !== closeRef.current && item.offsetParent !== null);
      (firstNavigationItem ?? closeRef.current)?.focus();
      const trigger = triggerRef.current;
      return () => {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
        if (trigger?.getClientRects().length && getComputedStyle(trigger).visibility === "visible") trigger.focus();
        else document.getElementById("main-content")?.focus();
      };
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpenAt(null); return; }
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const items = [...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !drawer.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !drawer.contains(active))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return (
    <>
      <button ref={triggerRef} type="button" aria-label={open ? "Menüyü kapat" : "Menüyü aç"} aria-expanded={open} onClick={() => setOpen(!open)} className="press grid size-11 place-items-center rounded-[10px] text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 md:hidden">
        <Menu aria-hidden className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menü">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setOpen(false)} />
          <div ref={drawerRef} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overscroll-contain overflow-y-auto bg-espresso p-4 shadow-pop">
            <button ref={closeRef} type="button" aria-label="Menüyü kapat" onClick={() => setOpen(false)} className="press mb-2 ml-auto grid size-11 place-items-center rounded-[10px] text-cream-muted outline-none hover:bg-surface/5 hover:text-cream focus-visible:ring-4 focus-visible:ring-brand-ring/60">
              <X aria-hidden className="size-5" />
            </button>
            <DrawerCloseContext.Provider value={close}>
              {children}
            </DrawerCloseContext.Provider>
          </div>
        </div>
      )}
    </>
  );
}
