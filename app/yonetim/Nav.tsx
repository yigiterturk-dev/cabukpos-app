"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; only?: "restoran" | "market" }[] = [
  { href: "/yonetim/urunler", label: "Ürünler" },
  { href: "/yonetim/stok", label: "Stok" },
  { href: "/yonetim/salon", label: "Salon", only: "restoran" },
  { href: "/yonetim/secenekler", label: "Seçenekler", only: "restoran" },
  { href: "/yonetim/istasyonlar", label: "İstasyonlar", only: "restoran" },
  { href: "/yonetim/bolgeler", label: "Bölgeler", only: "restoran" },
  { href: "/yonetim/musteriler", label: "Müşteriler", only: "restoran" },
  { href: "/yonetim/platformlar", label: "Platformlar", only: "restoran" },
  { href: "/yonetim/etiketler", label: "Raf etiketi" },
  { href: "/yonetim/personel", label: "Personel" },
  { href: "/yonetim/cihazlar", label: "Cihazlar" },
  { href: "/yonetim/donanim", label: "Donanım" },
  { href: "/yonetim/raporlar", label: "Raporlar" },
];

export function Nav({ vertical }: { vertical: "restoran" | "market" }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.filter((i) => !i.only || i.only === vertical).map((i) => (
        <Link key={i.href} href={i.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${path.startsWith(i.href) ? "bg-brand-soft font-medium text-brand" : "text-stone-600 hover:bg-stone-50"}`}>{i.label}</Link>
      ))}
    </nav>
  );
}
