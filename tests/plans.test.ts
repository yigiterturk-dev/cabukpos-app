import test from "node:test";
import assert from "node:assert/strict";
import { isUpgrade, planPrice, PLAN_ORDER } from "../lib/payments/plans.ts";

test("yükseltme yönü doğru tespit edilir", () => {
  assert.equal(isUpgrade("baslangic", "profesyonel"), true);
  assert.equal(isUpgrade("baslangic", "isletme"), true);
  assert.equal(isUpgrade("isletme", "baslangic"), false); // düşürme
  assert.equal(isUpgrade("profesyonel", "profesyonel"), false); // aynı plan
});

test("fiyatlar plan sırasıyla artar", () => {
  for (let i = 1; i < PLAN_ORDER.length; i++) {
    assert.ok(planPrice(PLAN_ORDER[i]!) > planPrice(PLAN_ORDER[i - 1]!));
  }
});
