// tests/ynr-bridge.test.ts — CabukPOS → YNR sipariş gövdesi ve platform kaynak sınırı.
import test from "node:test";
import assert from "node:assert/strict";
import { buildYnrOrderBody, PLATFORM_ORDER_SOURCES } from "@/lib/delivery/ynr";

test("YNR gövdesi hesap, koordinat, kapıda ödeme ve notu taşır", () => {
  const body = buildYnrOrderBody({
    externalId: "YS-1",
    externalCode: "wxfr-2440",
    customer: { name: "Ali Veli", phone: "05551112233" },
    address: "Mahalle Sok. No 1",
    dropoffLat: 41.01,
    dropoffLng: 29.02,
    note: "Kapıyı çal",
    collectAmount: 24175,
  }, "acc-1", false);
  assert.equal(body.provider, "cabukpos");
  assert.equal(body.accountId, "acc-1");
  assert.equal(body.externalOrderId, "YS-1");
  assert.equal(body.dispatchReady, false);
  assert.equal(body.order.dropoffLat, 41.01);
  assert.equal(body.order.codAmount, 241.75);
  assert.equal(body.order.notes, "wxfr-2440 · Kapıyı çal");
});

test("YNR yalnız platform sipariş kaynaklarını kapsar", () => {
  for (const platform of ["yemeksepeti", "migros", "getir", "trendyol", "trendyol_yemek"]) {
    assert.equal(PLATFORM_ORDER_SOURCES.has(platform), true, platform);
  }
  assert.equal(PLATFORM_ORDER_SOURCES.has("kiosk"), false);
});
