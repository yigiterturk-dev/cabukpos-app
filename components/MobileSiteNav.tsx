"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const LINK = "block rounded-lg px-4 py-3 text-sm text-ink-2 outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60";

export function MobileSiteNav() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      trigger.current?.focus();
    }
  };

  return (
    <div ref={root} className="relative md:hidden" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-site-navigation"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-line px-3 text-sm font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60"
      >
        Menü
      </button>
      <nav
        id="mobile-site-navigation"
        aria-label="Ana"
        hidden={!open}
        className="absolute left-1/2 top-full z-30 mt-2 w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 rounded-xl border border-line bg-surface p-2 shadow-pop"
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a");
          if (!link) return;
          setOpen(false);
          if (link.hash) {
            const id = decodeURIComponent(link.hash.slice(1));
            requestAnimationFrame(() => document.getElementById(id)?.querySelector<HTMLElement>("h1, h2")?.focus({ preventScroll: true }));
          }
        }}
      >
        <a href="#ozellikler" className={LINK}>Özellikler</a>
        <a href="#fiyat" className={LINK}>Fiyat</a>
        <a href="#sss" className={LINK}>Sorular</a>
        <Link href="/demo" className={LINK}>Canlı demo</Link>
        <Link href="/yardim" className={LINK}>Yardım</Link>
        <div className="my-1 border-t border-line sm:hidden" />
        <Link href="/kasa" className={`${LINK} sm:hidden`}>Kasayı aç</Link>
        <Link href="/giris" className={`${LINK} sm:hidden`}>Giriş</Link>
      </nav>
    </div>
  );
}
