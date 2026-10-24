// tests/transfer.test.ts — şubeler arası transfer kuralları.
import { test } from "node:test";
import assert from "node:assert/strict";
import { transferProblem } from "@/lib/core/transfer";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

test("transfer: kaynak ve hedef aynı şube olamaz", () => {
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: A, qtyMilli: 1000, level: 5000 }), "same-store");
});

test("transfer: miktar pozitif tam sayı olmalı", () => {
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: B, qtyMilli: 0, level: 5000 }), "qty");
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: B, qtyMilli: -1000, level: 5000 }), "qty");
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: B, qtyMilli: 1.5, level: 5000 }), "qty");
});

test("transfer: kaynak stoktan fazlası reddedilir, eşit miktar serbest", () => {
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: B, qtyMilli: 6000, level: 5000 }), "insufficient");
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: B, qtyMilli: 5000, level: 5000 }), null);
  assert.equal(transferProblem({ fromStoreId: A, toStoreId: B, qtyMilli: 1000, level: 5000 }), null);
});
