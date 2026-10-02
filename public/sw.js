// ÇabukPOS service worker'ı. /kasa ve /yonetim gezinmesi: ağ önce, yoksa önbellek. /_next/static: önbellek önce.
// API istekleri hiç önbelleğe alınmaz. Giden kutusu için Background Sync: ağ dönünce sayfaya "sync-now" yollar.
const KASA = "cabukpos-kasa-v1";
const YONETIM = "cabukpos-yonetim-v1";

const offlineRes = () => new Response("Çevrimdışı", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// Gezinme: ağ önce (yönlendirme/404 önbelleğe yazılmaz), kesintide o sayfanın son kopyası, o da yoksa panel girişi.
const nav = (cacheName, fallback) => (req) =>
  fetch(req)
    .then((res) => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(cacheName).then((c) => c.put(req, copy)); }
      return res;
    })
    .catch(() =>
      caches
        .match(req, { ignoreVary: true })
        .then((r) => r || caches.match(fallback, { ignoreVary: true }))
        .then((r) => r || offlineRes()),
    );

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(KASA).then((c) => c.add(new Request("/kasa", { cache: "reload" }))).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  const keep = [KASA, YONETIM];
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("cabukpos-") && !keep.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && (url.pathname === "/kasa" || url.pathname === "/kasa/")) {
    e.respondWith(nav(KASA, "/kasa")(req));
    return;
  }

  if (req.mode === "navigate" && (url.pathname === "/yonetim" || url.pathname.startsWith("/yonetim/"))) {
    e.respondWith(nav(YONETIM, "/yonetim")(req));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) { const copy = res.clone(); caches.open(YONETIM).then((c) => c.put(req, copy)); }
            return res;
          }),
      ),
    );
  }
});

// Background Sync: kuyrukta iş varken ağ dönünce (sekme arka planda bile) sayfaları uyandır.
self.addEventListener("sync", (e) => {
  if (e.tag !== "kasa-outbox") return;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => Promise.all(cs.map((c) => c.postMessage({ type: "sync-now" })))),
  );
});
