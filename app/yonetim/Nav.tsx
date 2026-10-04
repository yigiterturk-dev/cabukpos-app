"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Armchair, Bell, Boxes, Building2, CalendarClock, ChartColumn, ChefHat, Contact, CookingPot, CreditCard, Flame, Gift, Globe, Handshake, LayoutDashboard, MapPin, Menu, Database, MonitorSmartphone, Package, PackagePlus, Plug, Printer, Receipt, ShieldCheck, SlidersHorizontal, Star, Tag, Ticket, TrendingUp, UserCog, X, Clock, ClipboardList, type LucideIcon, Settings } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; only?: "restoran" | "market"; exact?: boolean };
const groups: { title: string; items: Item[] }[] = [
  { title: "Genel", items: [
    { href: "/yonetim", label: "Bugün", icon: LayoutDashboard, exact: true },
    { href: "/yonetim/bildirimler", label: "Bildirimler", icon: Bell },
    { href: "/yonetim/raporlar", label: "Raporlar", icon: ChartColumn },
    { href: "/yonetim/tercihler", label: "Tercihler", icon: Settings },
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
  ] },
  { title: "Satış kanalları", items: [
    { href: "/yonetim/salon", label: "Salon", icon: Armchair, only: "restoran" },
    { href: "/yonetim/rezervasyonlar", label: "Rezervasyon", icon: CalendarClock, only: "restoran" },
    { href: "/yonetim/istasyonlar", label: "İstasyonlar", icon: Flame, only: "restoran" },
    { href: "/yonetim/bolgeler", label: "Bölgeler", icon: MapPin, only: "restoran" },
    { href: "/yonetim/musteriler", label: "Müşteriler", icon: Contact, only: "restoran" },
    { href: "/yonetim/buyume", label: "Büyüme Merkezi", icon: TrendingUp, only: "restoran" },
    { href: "/yonetim/platformlar", label: "Platformlar", icon: Globe, only: "restoran" },
  ] },
  { title: "Sadakat", items: [
    { href: "/yonetim/sadakat", label: "Puan programı", icon: Star },
    { href: "/yonetim/kuponlar", label: "Kuponlar", icon: Ticket },
    { href: "/yonetim/hediyekarti", label: "Hediye kartı", icon: Gift },
  ] },
  { title: "İşletme", items: [
    { href: "/yonetim/subeler", label: "Şubeler", icon: Building2 },
    { href: "/yonetim/personel", label: "Personel", icon: UserCog },
    { href: "/yonetim/cihazlar", label: "Cihazlar", icon: MonitorSmartphone },
    { href: "/yonetim/donanim", label: "Donanım", icon: Printer },
    { href: "/yonetim/mali", label: "Mali", icon: Receipt },
    { href: "/yonetim/veriler", label: "Veriler", icon: Database },
    { href: "/yonetim/denetim", label: "Denetim", icon: ShieldCheck },
    { href: "/yonetim/entegrasyonlar", label: "Entegrasyonlar", icon: Plug },
    { href: "/yonetim/abonelik", label: "Abonelik", icon: CreditCard },
  ] },
];

export function Nav({ vertical }: { vertical: "restoran" | "market" }) {
  const path = usePathname();
  return (
    <nav aria-label="Yönetim" className="space-y-5">
      {groups.map((g) => {
        const items = g.items.filter((i) => !i.only || i.only === vertical);
        if (!items.length) return null;
        return (
          <div key={g.title}>
          <div aria-hidden className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-muted/70">{g.title}</div>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const on = i.exact ? path === i.href : path.startsWith(i.href);
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm outline-none transition focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "bg-gradient-to-b from-[#ee6318] to-[#c2410c] font-semibold text-white shadow-glow" : "font-medium text-cream-muted hover:bg-white/5 hover:text-cream"}`}>
                      <Icon aria-hidden className={`size-4 shrink-0 ${on ? "text-white" : ""}`} />{i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Mobil: üst çubuktaki düğme + soldan çekmece. Rota değişince kapanır. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  // Açıldığı rotayı tutar: rota değişince kendiliğinden kapalı sayılır (efektte setState yok).
  const path = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" aria-label="Menüyü aç" aria-expanded={open} onClick={() => setOpen(true)} className="press grid size-11 place-items-center rounded-[10px] text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 md:hidden">
        <Menu aria-hidden className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menü">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-espresso p-4 shadow-pop">
            <button type="button" aria-label="Menüyü kapat" onClick={() => setOpen(false)} className="press mb-2 ml-auto grid size-11 place-items-center rounded-[10px] text-cream-muted outline-none hover:bg-white/5 hover:text-cream focus-visible:ring-4 focus-visible:ring-brand-ring/60">
              <X aria-hidden className="size-5" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
