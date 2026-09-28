// ÇabukPOS kasa service worker'ı. /kasa gezinmesi: ağ önce, yoksa önbellek. /_next/static: önbellek önce.
// API ve yönetim sayfaları hiç önbelleğe alınmaz.
const CACHE = "cabukpos-kasa-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request("/kasa", { cache: "reload" }))).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("cabukpos-kasa-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && (url.pathname === "/kasa" || url.pathname === "/kasa/")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/kasa", copy)); }
          return res;
        })
        .catch(() => caches.match("/kasa").then((r) => r || new Response("Çevrimdışı", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
            return res;
          }),
      ),
    );
  }
});
