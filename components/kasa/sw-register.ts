// Kasa service worker'ı kaydı + ilk çevrimiçi yüklemede sayfanın kendi statik dosyalarını önbelleğe koyma.
// (İlk yükleme henüz SW denetiminde olmadığı için JS/CSS/font dosyaları SW'den geçmez; burada elle eklenir.)
export const KASA_CACHE = "cabukpos-kasa-v1";

export function registerKasaSw() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  if (!navigator.onLine) return;
  const warm = async () => {
    try {
      const cache = await caches.open(KASA_CACHE);
      const urls = new Set<string>(["/kasa"]);
      for (const e of performance.getEntriesByType("resource")) {
        const u = new URL(e.name);
        if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
      }
      document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet][href], link[rel=preload][href]").forEach((el) => {
        const u = new URL("src" in el && el.src ? el.src : (el as HTMLLinkElement).href, location.href);
        if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
      });
      await Promise.all([...urls].map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
      // Yeni sürümle kullanılmayan eski statik dosyaları buda.
      for (const req of await cache.keys()) {
        const u = new URL(req.url);
        if (u.pathname.startsWith("/_next/static/") && !urls.has(u.pathname + u.search)) await cache.delete(req);
      }
    } catch {}
  };
  if (document.readyState === "complete") setTimeout(warm, 500);
  else window.addEventListener("load", () => setTimeout(warm, 500), { once: true });
}

// Background Sync: çevrimdışıyken kuyruk doluysa kaydet; ağ dönünce SW "sync-now" yollar (sekme arka planda bile).
export function registerOutboxSync() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("SyncManager" in window)) return;
  type SyncCapable = ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } };
  void navigator.serviceWorker.ready.then((r) => (r as SyncCapable).sync.register("kasa-outbox")).catch(() => {});
}

export function onSyncNow(cb: () => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const onMessage = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === "sync-now") cb();
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}
