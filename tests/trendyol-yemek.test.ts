// tests/trendyol-yemek.test.ts — Gerçek Trendyol Yemek uçları: fiil, yol, başlık ve gövde.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createYemekClient, parsePackages, toIncomingOrder, yemekConfig } from "@/lib/platform/trendyol-yemek";

const ENV = {
  TRENDYOL_YEMEK_SUPPLIER_ID: "5631684",
  TRENDYOL_YEMEK_STORE_ID: "245335",
  TRENDYOL_YEMEK_API_KEY: "k",
  TRENDYOL_YEMEK_API_SECRET: "s",
  TRENDYOL_YEMEK_AGENT: "CabukPOS",
  TRENDYOL_YEMEK_EXECUTOR: "destek@cabukpos.example",
  TRENDYOL_YEMEK_API_BASE: "https://stageapi.tgoapis.com",
};

function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  return fn().finally(() => {
    for (const k of Object.keys(ENV)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };

function recorder(payload: unknown = {}) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    seen.push({ url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

test("yapılandırma: eksik alanlar Türkçe hatayla söylenir", () => {
  assert.throws(() => yemekConfig({} as unknown as NodeJS.ProcessEnv), /TRENDYOL_YEMEK_SUPPLIER_ID/);
  const c = yemekConfig(ENV as unknown as NodeJS.ProcessEnv);
  assert.equal(c.base, "https://stageapi.tgoapis.com");
});

test("kabul: PUT /packages/picked, x-agentname + x-executor-user + Basic auth", async () => {
  await withEnv(async () => {
    const { seen, fetchImpl } = recorder();
    await createYemekClient({ fetch: fetchImpl }).accept("107385", 20);
    const call = seen[0];
    assert.equal(call.method, "PUT");
    assert.equal(call.url, "https://stageapi.tgoapis.com/integrator/order/meal/suppliers/5631684/packages/picked");
    assert.equal(call.headers["x-agentname"], "CabukPOS");
    assert.equal(call.headers["x-executor-user"], "destek@cabukpos.example");
    assert.equal(call.headers.authorization, `Basic ${Buffer.from("k:s").toString("base64")}`);
    assert.deepEqual(call.body, { packageId: 107385, preparationTime: 20 });
  });
});

test("yola çıkış ve iptal yolları dokümandaki gibidir", async () => {
  await withEnv(async () => {
    const { seen, fetchImpl } = recorder();
    const c = createYemekClient({ fetch: fetchImpl });
    await c.ship("107385");
    await c.cancel("107385");
    await c.cancel("107385", ["9001", "9002"]);
    assert.equal(seen[0].url, "https://stageapi.tgoapis.com/integrator/order/meal/suppliers/5631684/packages/107385/manual-shipped");
    assert.deepEqual(seen[1].body, { packageId: 107385 });
    assert.deepEqual(seen[2].body, { packageId: 107385, itemIdList: [9001, 9002] });
  });
});

test("paket çekme: storeId + sayfalama + çoklu statü parametresi", async () => {
  await withEnv(async () => {
    const { seen, fetchImpl } = recorder({ content: [] });
    await createYemekClient({ fetch: fetchImpl }).fetchPackages("Cancelled,Picking");
    const url = new URL(seen[0].url);
    assert.equal(url.pathname, "/integrator/order/meal/suppliers/5631684/packages");
    assert.equal(url.searchParams.get("storeId"), "245335");
    assert.equal(url.searchParams.get("packageStatuses"), "Cancelled,Picking");
  });
});

test("HTTP hatası sunucu mesajıyla yükselir", async () => {
  await withEnv(async () => {
    const fail = (async () => new Response('{"message":"paket bulunamdı"}', { status: 404 })) as unknown as typeof fetch;
    await assert.rejects(() => createYemekClient({ fetch: fail }).ship("1"), /HTTP 404.*paket bulunamdı/);
  });
});

test("paket modeli ortak siparişe çevrilir", () => {
  const pkgs = parsePackages({
    content: [
      {
        id: 107385,
        status: "Picking",
        deliveryType: "GO",
        createdDate: 1783520347138,
        customer: { firstName: "Ayşe", lastName: "Yılmaz", phone: "05321112233", note: "kapıcıya" },
        address: { address1: "Kadıköy, İstanbul", addressText: "Kadıköy" },
        payment: { paymentType: "PAY_WITH_ON_DELIVERY" },
        totalPrice: 285.5,
        lines: [{ lineItemId: 9001, productId: 42, name: "Adana Dürüm", quantity: 2, price: 120.25 }],
      },
    ],
  });
  assert.equal(pkgs.length, 1);
  const order = toIncomingOrder(pkgs[0]);
  assert.equal(order.externalId, "107385");
  assert.equal(order.customer.name, "Ayşe Yılmaz");
  assert.equal(order.customer.phone, "05321112233");
  assert.equal(order.address, "Kadıköy, İstanbul");
  assert.equal(order.payIntent, "nakit");
  assert.equal(order.lines[0].code, "42");
  assert.equal(order.lines[0].unitPrice, 12025);
  assert.equal(order.lines[0].qtyMilli, 2000);
  assert.equal(order.lines[0].note, null);
});

test("canlı API şekli: packageStatus, items[] adedi, unitSellingPrice, seçenek notu", () => {
  const [p] = parsePackages({
    content: [
      {
        id: "3301", orderNumber: "TY-77", packageStatus: "Delivered", storePickupSelected: true,
        packageCreationDate: 1794076272215, customerNote: "zil çalışmıyor", totalPrice: 690,
        customer: { firstName: "Can", lastName: "Ak" }, address: { address1: "Atakum", phone: "0532 111 22 33" },
        payment: { paymentType: "PAY_WITH_CARD" },
        lines: [
          { productId: 7, name: "Lahmacun", price: 100, unitSellingPrice: 115,
            items: [{ isCancelled: false }, { isCancelled: false }, { isCancelled: true }],
            modifierProducts: [{ name: "Acılı", price: 15 }], removedIngredients: [{ name: "Soğan" }] },
          { productId: 8, name: "Ayran", price: 30, unitSellingPrice: 30, items: [{ isCancelled: true }] },
          { productId: 9, name: "Künefe", price: 460, unitSellingPrice: 460, items: [{ isCancelled: false }] },
        ],
      },
    ],
  });
  assert.equal(p.status, "Delivered");
  assert.equal(p.code, "TY-77");
  assert.equal(p.isStorePickup, true);
  assert.equal(p.createdAt, new Date(1794076272215).toISOString());
  assert.equal(p.note, "zil çalışmıyor");
  const o = toIncomingOrder(p);
  assert.equal(o.lines.length, 2, "tamamı iptal satır düşer");
  assert.deepEqual([o.lines[0].qtyMilli, o.lines[0].unitPrice, o.lines[0].note], [2000, 11500, "Acılı, -Soğan"]);
  const sum = o.lines.reduce((s, l) => s + (l.unitPrice * l.qtyMilli) / 1000, 0);
  assert.equal(sum, 69000);
});

test("salt okuma: GET geçer, kabul/yola çıkış/iptal ağa hiç çıkmaz", async () => {
  process.env.TRENDYOL_YEMEK_READ_ONLY = "1";
  try {
    await withEnv(async () => {
      const r = recorder({ content: [] });
      const c = createYemekClient({ fetch: r.fetchImpl });
      await c.fetchPackages("Delivered", 2);
      await assert.rejects(c.accept("1", 10), /salt okuma/);
      await assert.rejects(c.ship("1"), /salt okuma/);
      await assert.rejects(c.cancel("1"), /salt okuma/);
      assert.equal(r.seen.length, 1);
      assert.equal(r.seen[0].method, "GET");
      assert.ok(r.seen[0].url.includes("page=2"));
    });
  } finally {
    delete process.env.TRENDYOL_YEMEK_READ_ONLY;
  }
});
