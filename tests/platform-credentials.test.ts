// tests/platform-credentials.test.ts — pazaryeri BYOK: şifreli kimlik, öncelik sırası, adaptör kullanımı.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePlatformApi, platformApi, readPlatformApi } from "@/lib/platform/credentials";
import { createGetirSource } from "@/lib/platform/getir";
import type { Conn } from "@/lib/platform/types";

const conn = (credentials: string | null): Conn => ({
  id: "c1", tenantId: "t1", storeId: "s1", platform: "getir", credentials,
  webhookSecret: "w", webhookToken: "x", autoAccept: true, active: true,
});

test("encode/read: AES-256-GCM round-trip; bozuk kayıt null", () => {
  const old = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-secret";
  try {
    const enc = encodePlatformApi({ base: "https://api.getir.test", key: "gizli-anahtar" });
    assert.ok(enc);
    assert.deepEqual(readPlatformApi(conn(enc)), { base: "https://api.getir.test", key: "gizli-anahtar" });
    assert.equal(readPlatformApi(conn("bozuk")), null);
    assert.equal(readPlatformApi(conn(null)), null);
    assert.deepEqual(readPlatformApi(conn(encodePlatformApi(null))), null);
  } finally {
    if (old === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = old;
  }
});

test("platformApi önceliği: açık cfg → kayıtlı → env", () => {
  const old = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-secret";
  try {
    const saved = encodePlatformApi({ base: "https://saved.test", key: "saved-key" });
    assert.deepEqual(platformApi(conn(saved), "https://env.test", "env-key", "Getir"), { base: "https://saved.test", key: "saved-key" });
    assert.deepEqual(platformApi(conn(saved), undefined, undefined, "Getir", { base: "https://cfg.test", key: "cfg-key" }), { base: "https://cfg.test", key: "cfg-key" });
    assert.deepEqual(platformApi(conn(null), "https://env.test/", "env-key", "Getir"), { base: "https://env.test", key: "env-key" });
    assert.throws(() => platformApi(conn(null), undefined, undefined, "Getir"), /Getir entegrasyonu yapılandırılmamış/);
  } finally {
    if (old === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = old;
  }
});

test("Getir adaptörü kayıtlı BYOK kimliğini kullanır (env'i ezmez)", async () => {
  const old = { secret: process.env.AUTH_SECRET, base: process.env.GETIR_API_BASE, key: process.env.GETIR_API_KEY, fetch: globalThis.fetch };
  process.env.AUTH_SECRET = "test-secret";
  process.env.GETIR_API_BASE = "https://env.getir.test";
  process.env.GETIR_API_KEY = "env-key";
  try {
    const saved = encodePlatformApi({ base: "https://saved.getir.test", key: "saved-key" });
    let url = "", headers: Record<string, string> = {};
    globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u); headers = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ ok: 1, failed: 0 }), { status: 200 });
    }) as typeof fetch;
    const source = createGetirSource(true);
    const result = await source.pushCatalog!(conn(saved), [{ code: "SU", name: "Su", price: 1500, stock: 1, active: true }]);
    assert.deepEqual(result, { ok: 1, failed: 0 });
    assert.equal(url, "https://saved.getir.test/stores/s1/catalog");
    assert.equal(headers.authorization, "Bearer saved-key");
  } finally {
    if (old.secret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = old.secret;
    if (old.base === undefined) delete process.env.GETIR_API_BASE; else process.env.GETIR_API_BASE = old.base;
    if (old.key === undefined) delete process.env.GETIR_API_KEY; else process.env.GETIR_API_KEY = old.key;
    globalThis.fetch = old.fetch;
  }
});
