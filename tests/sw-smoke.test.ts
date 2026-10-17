// tests/sw-smoke.test.ts — service worker sözdizimi + olay dinleyicileri (tarayıcı ortamı olmadan).
// sw.js düz JS: stub `self` ile çalıştırılması hem derleme hatasını yakalar hem kayıtlı
// dinleyicileri sayar (Background Sync / periodicsync / fetch önbellek katmanı).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type StubFetchEvent = {
  request: { method: string; mode: string; url: string };
  respondWith(promise: Promise<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
};

test("sw.js: derlenir ve beklenen olay dinleyicileri kayıtlı", () => {
  const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers: Record<string, unknown[]> = {};
  const selfStub = { addEventListener: (t: string, f: unknown) => (handlers[t] ??= []).push(f) };
  new Function("self", src)(selfStub);
  for (const t of ["install", "activate", "fetch", "sync", "periodicsync"]) assert.ok(handlers[t]?.length, `${t} dinleyicisi yok`);
});

test("sw.js: SW boşaltıcı Dexie şemasıyla aynı DB/depo adlarını kullanıyor", () => {
  const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(src, /DB_NAME = "cabukpos-kasa"/);
  for (const store of ["meta", "sales", "outbox", "rejected", "tabEvents"]) assert.ok(src.includes(`"${store}"`), `${store} deposu eksik`);
});

test("sw.js: statik dosyada çevrimiçiyken güncel ağ yanıtını kullanıp önbelleği yeniliyor", async () => {
  const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers: Record<string, ((event: StubFetchEvent) => void)[]> = {};
  let refreshed = "";
  const cache = { put: async (_req: unknown, res: Response) => { refreshed = await res.text(); } };
  const cachesStub = {
    match: async () => new Response("eski önbellek"),
    open: async () => cache,
  };
  const selfStub = { location: new URL("https://cabukpos.test"), addEventListener: (type: string, handler: (event: StubFetchEvent) => void) => (handlers[type] ??= []).push(handler) };
  new Function("self", "caches", "fetch", src)(selfStub, cachesStub, async () => new Response("güncel ağ"));

  let responsePromise: Promise<Response> | undefined;
  const background: Promise<unknown>[] = [];
  handlers.fetch[0]({
    request: { method: "GET", mode: "cors", url: "https://cabukpos.test/_next/static/app.js" },
    respondWith: (promise: Promise<Response>) => { responsePromise = promise; },
    waitUntil: (promise: Promise<unknown>) => background.push(promise),
  });

  assert.equal(background.length, 1, "cache write must be attached before the fetch event handler returns");
  assert.equal(await (await responsePromise!).text(), "güncel ağ");
  await Promise.all(background);
  assert.equal(refreshed, "güncel ağ");
});

test("sw.js: statik dosyayı yalnız ağ isteği başarısızsa önbellekten sunuyor", async () => {
  const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers: Record<string, ((event: StubFetchEvent) => void)[]> = {};
  const cachesStub = { match: async () => new Response("önbellek kopyası"), open: async () => ({ put: async () => {} }) };
  const selfStub = { location: new URL("https://cabukpos.test"), addEventListener: (type: string, handler: (event: StubFetchEvent) => void) => (handlers[type] ??= []).push(handler) };
  new Function("self", "caches", "fetch", src)(selfStub, cachesStub, async () => { throw new TypeError("çevrimdışı"); });

  let responsePromise: Promise<Response> | undefined;
  handlers.fetch[0]({
    request: { method: "GET", mode: "cors", url: "https://cabukpos.test/_next/static/app.js" },
    respondWith: (promise: Promise<Response>) => { responsePromise = promise; },
    waitUntil: () => {},
  });

  assert.equal(await (await responsePromise!).text(), "önbellek kopyası");
});
