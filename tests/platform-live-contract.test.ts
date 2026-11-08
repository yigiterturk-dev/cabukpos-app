// tests/platform-live-contract.test.ts — beş adaptörün canlı istek sözleşmesi (BYOK kimlikle).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { encodePlatformApi } from "@/lib/platform/credentials";
import { createGetirSource } from "@/lib/platform/getir";
import { createYemeksepetiSource } from "@/lib/platform/yemeksepeti";
import { createTrendyolSource } from "@/lib/platform/trendyol";
import { createMigrosSource } from "@/lib/platform/migros";
import { createTiklaGelsinSource } from "@/lib/platform/tiklagelsin";
import type { Conn, OrderSource } from "@/lib/platform/types";

process.env.AUTH_SECRET = "test-secret";

const factories: { id: string; make: (enabled: boolean) => OrderSource }[] = [
  { id: "getir", make: createGetirSource },
  { id: "yemeksepeti", make: createYemeksepetiSource },
  { id: "trendyol", make: createTrendyolSource },
  { id: "migros", make: createMigrosSource },
  { id: "tiklagelsin", make: createTiklaGelsinSource },
];

type Call = { url: string; init: RequestInit };

function mockFetch(calls: Call[]) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/catalog")) return new Response(JSON.stringify({ ok: 1, failed: 0 }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
}

const body = (c: Call) => JSON.parse(String(c.init.body));
const auth = (c: Call) => (c.init.headers as Record<string, string>).authorization;

for (const f of factories) {
  test(`${f.id}: accept/reject/status/catalog istek sözleşmesi`, async () => {
    const base = `https://${f.id}.test`;
    const conn: Conn = {
      id: "c1", tenantId: "t1", storeId: "s1", platform: f.id,
      credentials: encodePlatformApi({ base, key: "byok-key" }),
      webhookSecret: "w", webhookToken: "x", autoAccept: true, active: true,
    };
    const calls: Call[] = [];
    mockFetch(calls);
    const source = f.make(true);

    await source.accept(conn, "o1", 7);
    assert.equal(calls.at(-1)!.url, `${base}/orders/o1/accept`);
    assert.equal(calls.at(-1)!.init.method, "POST");
    assert.deepEqual(body(calls.at(-1)!), { prepMin: 7 });
    assert.equal(auth(calls.at(-1)!), "Bearer byok-key");

    await source.reject(conn, "o1", "stok yok");
    assert.equal(calls.at(-1)!.url, `${base}/orders/o1/reject`);
    assert.deepEqual(body(calls.at(-1)!), { reason: "stok yok" });

    await source.pushStatus!(conn, "o1", "delivered");
    assert.equal(calls.at(-1)!.url, `${base}/orders/o1/status`);
    assert.deepEqual(body(calls.at(-1)!), { status: "delivered" });

    const items = [{ code: "SU", name: "Su", price: 1500, stock: 3, active: true }];
    assert.deepEqual(await source.pushCatalog!(conn, items), { ok: 1, failed: 0 });
    assert.equal(calls.at(-1)!.url, `${base}/stores/s1/catalog`);
    assert.equal(calls.at(-1)!.init.method, "PUT");
    assert.deepEqual(body(calls.at(-1)!), { items });
  });
}

test("adaptör HTTP hatası Türkçe ve sağlayıcı adıyla düşer", async () => {
  globalThis.fetch = (async () => new Response("upss", { status: 502 })) as typeof fetch;
  const conn: Conn = {
    id: "c1", tenantId: "t1", storeId: "s1", platform: "getir",
    credentials: encodePlatformApi({ base: "https://getir.test", key: "k" }),
    webhookSecret: "w", webhookToken: "x", autoAccept: true, active: true,
  };
  await assert.rejects(createGetirSource(true).accept(conn, "o1", 5), /Getir kabul hatası: HTTP 502/);
});

after(() => {
  delete process.env.AUTH_SECRET;
});
