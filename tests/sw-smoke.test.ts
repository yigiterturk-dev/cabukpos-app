// tests/sw-smoke.test.ts — service worker sözdizimi + olay dinleyicileri (tarayıcı ortamı olmadan).
// sw.js düz JS: stub `self` ile çalıştırılması hem derleme hatasını yakalar hem kayıtlı
// dinleyicileri sayar (Background Sync / periodicsync / fetch önbellek katmanı).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
