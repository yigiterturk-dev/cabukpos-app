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

// Background Sync: kuyrukta iş varken ağ dönünce kasa sayfalarını uyandır.
// Hiç kasa sekmesi açık değilse sayfa motoru çalışamaz → SW aynı IndexedDB'yi
// (Dexie "cabukpos-kasa" v3) ham IDB ile açıp giden kutusunu kendisi yollar (#23).
const kasaClients = () =>
  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((cs) => cs.filter((c) => { const p = new URL(c.url).pathname; return p === "/kasa" || p.startsWith("/kasa/"); }));

self.addEventListener("sync", (e) => {
  if (e.tag !== "kasa-outbox") return;
  e.waitUntil(
    kasaClients().then((cs) => {
      if (cs.length) return Promise.all(cs.map((c) => c.postMessage({ type: "sync-now" })));
      return drainOutbox();
    }),
  );
});

// Periyodik uyandırma (kurulu PWA, Chrome): sekme kapalıyken bile kuyruk fırsat buldukça boşalır.
self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "kasa-outbox-drain") return;
  e.waitUntil(kasaClients().then((cs) => (cs.length ? undefined : drainOutbox())));
});

const DB_NAME = "cabukpos-kasa";
const DB_VERSION = 3;
const DRAIN_BATCH = 50;

const idbReq = (r) =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

// Dexie şemasının aynısı (db.ts v3). Dexie ileride v4'e çıkarsa da bu açılış çalışır;
// bilinen depoların biçimi değişmedikçe boşaltım güvenli kalır.
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "id" });
      if (!db.objectStoreNames.contains("outbox")) {
        const o = db.createObjectStore("outbox", { keyPath: "n", autoIncrement: true });
        o.createIndex("id", "id");
      }
      if (!db.objectStoreNames.contains("rejected")) db.createObjectStore("rejected", { keyPath: "id" });
      if (!db.objectStoreNames.contains("tabEvents")) db.createObjectStore("tabEvents", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Bir batch gönderir; iş kaldıysa true döner. Ağ/sunucu hatasında durur (sonraki uyandırmada devam). */
async function drainOnce(db) {
  const tx = db.transaction(["meta", "outbox"], "readonly");
  const meta = await idbReq(tx.objectStore("meta").get("state"));
  const deviceId = meta && meta.device ? meta.device.id : null;
  if (!deviceId) return false;
  const rows = [];
  await new Promise((res, rej) => {
    const cur = tx.objectStore("outbox").openCursor();
    cur.onsuccess = () => {
      if (cur.result && rows.length < DRAIN_BATCH) {
        rows.push(cur.result.value);
        cur.result.continue();
      } else res(null);
    };
    cur.onerror = () => rej(cur.error);
  });
  if (!rows.length) return false;

  let res;
  try {
    res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, docs: rows.map((r) => r.doc) }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const body = await res.json();
  const results = (body && body.results) || [];
  const now = new Date().toISOString();
  const txw = db.transaction(["outbox", "rejected"], "readwrite");
  const out = txw.objectStore("outbox");
  const rej = txw.objectStore("rejected");
  for (const [i, r] of results.entries()) {
    const row = rows[i]; // sonuçlar gönderilen sırayla
    if (!row) continue;
    if (r && !r.ok) rej.put({ id: row.id, doc: row.doc, error: r.error, at: now });
    out.delete(row.n);
  }
  await new Promise((res, rej) => {
    txw.oncomplete = () => res(null);
    txw.onerror = () => rej(txw.error);
    txw.onabort = () => rej(txw.error);
  });
  return true;
}

async function drainOutbox() {
  try {
    const db = await idbOpen();
    try {
      for (let i = 0; i < 100 && (await drainOnce(db)); i++);
    } finally {
      db.close();
    }
  } catch {}
}
