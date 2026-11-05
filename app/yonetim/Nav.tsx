"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/core/search";
import { Menu, Search, X, type LucideIcon } from "lucide-react";
import { visibleChildren, visibleHubs, type NavContext } from "./nav-data";

type NavItemData = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number };

function NavItem({ item, path, active, onSelect }: { item: NavItemData; path: string; active?: boolean; onSelect?: () => void }) {
  const on = active ?? (item.exact ? path === item.href : path.startsWith(item.href));
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

/** Sidebar menüsü: 10 ana başlık + arama. Alt sayfalar hub sayfalarından açılır. */
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
  const ctx: NavContext = useMemo(() => ({ vertical, storeCount, allStores }), [vertical, storeCount, allStores]);
  const hubs = useMemo(() => visibleHubs(ctx), [ctx]);
  const leaves = useMemo(() => hubs.flatMap((h) => visibleChildren(h, ctx)), [hubs, ctx]);
  const searchPool = useMemo(() => [...hubs, ...leaves].filter((i, index, all) => all.findIndex((x) => x.href === i.href) === index), [hubs, leaves]);
  const needle = normalizeSearchText(q.trim());
  const matches = needle ? searchPool.filter((i) => normalizeSearchText(i.label).includes(needle)) : [];
  const activeHub = hubs.find((hub) => hub.exact
    ? path === hub.href
    : path === hub.href || path.startsWith(`${hub.href}/`) || visibleChildren(hub, ctx).some((leaf) => path === leaf.href || path.startsWith(`${leaf.href}/`)));
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
        {matchNotice?.query === needle ? matchNotice.text : ""}
      </p>

      {needle ? (
        <ul className="space-y-0.5">
          {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-cream-muted">Sonuç yok</li>}
          {matches.map((i) => <li key={i.href}><NavItem item={i} path={path} onSelect={() => { setQ(""); onNavigate?.(); }} /></li>)}
        </ul>
      ) : (
        <ul className="space-y-0.5">
          {hubs.map((hub) => (
            <li key={hub.href}>
              <NavItem
                item={{ href: hub.href, label: hub.label, icon: hub.icon, exact: hub.exact, badge: hub.href === "/yonetim/satis" ? openTabs : undefined }}
                path={path}
                active={activeHub?.href === hub.href}
                onSelect={() => { setQ(""); onNavigate?.(); }}
              />
            </li>
          ))}
        </ul>
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
    const desktop = window.matchMedia("(min-width: 64rem)");
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
      <button ref={triggerRef} type="button" aria-label={open ? "Menüyü kapat" : "Menüyü aç"} aria-expanded={open} onClick={() => setOpen(!open)} className="press grid size-11 place-items-center rounded-[10px] text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 lg:hidden">
        <Menu aria-hidden className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü">
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
