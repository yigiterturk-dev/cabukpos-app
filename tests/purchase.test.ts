// tests/purchase.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseTotal, shouldUpdateCost, supplierBalance } from "@/lib/core/purchase";

test("alış toplamı: kalem başına yuvarlanır", () => {
  assert.equal(purchaseTotal([{ qtyMilli: 10000, unitCost: 2000 }, { qtyMilli: 5000, unitCost: 40000 }]), 220000);
  assert.equal(purchaseTotal([{ qtyMilli: 333, unitCost: 1001 }]), 333); // 333.333
});

test("eski tarihli alış maliyeti ezmez", () => {
  assert.equal(shouldUpdateCost("2026-09-28", null), true);
  assert.equal(shouldUpdateCost("2026-09-28", "2026-09-28"), true);
  assert.equal(shouldUpdateCost(new Date("2026-09-27"), new Date("2026-09-28")), false);
});

test("tedarikçi bakiyesi: iptal sayılmaz", () => {
  assert.equal(supplierBalance([{ total: 220000, status: "kayitli" }, { total: 5000, status: "iptal" }], [{ amount: 100000 }]), 120000);
});
