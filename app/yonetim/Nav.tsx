"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/yonetim/urunler", label: "Ürünler" },
  { href: "/yonetim/personel", label: "Personel" },
  { href: "/yonetim/cihazlar", label: "Cihazlar" },
  { href: "/yonetim/raporlar", label: "Raporlar" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${path.startsWith(i.href) ? "bg-brand-soft font-medium text-brand" : "text-stone-600 hover:bg-stone-50"}`}>{i.label}</Link>
      ))}
    </nav>
  );
}
