"use client";
// Yönetim paneli çevrimdışı desteği: service worker kaydı + sayfanın statik dosyalarını önbelleğe koyma
// (SW'nin ilk yüklemeyi denetimi altına alamadığı boşluk, kasa kaydının panel karşılığı; budama yok — kasanın önbelleğine dokunmaz)
// ve çevrimdışıyken "son yüklenen veri" bandı.
import { useEffect, useSyncExternalStore } from "react";

export const YONETIM_CACHE = "cabukpos-yonetim-v1";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

function registerPanelSw() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  if (!navigator.onLine) return;
  const warm = async () => {
    try {
      const cache = await caches.open(YONETIM_CACHE);
      const urls = new Set<string>([location.pathname]);
      for (const e of performance.getEntriesByType("resource")) {
        const u = new URL(e.name);
        if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
      }
      document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet][href], link[rel=preload][href]").forEach((el) => {
        const u = new URL("src" in el && el.src ? el.src : (el as HTMLLinkElement).href, location.href);
        if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
      });
      await Promise.all([...urls].map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    } catch {}
  };
  if (document.readyState === "complete") setTimeout(warm, 500);
  else window.addEventListener("load", () => setTimeout(warm, 500), { once: true });
}

export function PanelOffline() {
  useEffect(registerPanelSw, []);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-[14px] border border-warn/30 bg-warn-soft p-3 text-center text-sm text-warn shadow-lg md:right-6 md:left-auto md:mx-0 print:hidden">
      Çevrimdışısınız — son yüklenen sayfa gösteriliyor. İşlemler ağ geri gelene kadar askıda kalır.
    </div>
  );
}
