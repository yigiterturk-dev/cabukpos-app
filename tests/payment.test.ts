// tests/payment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { settle } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";

test("ödeme: tam, karma, para üstü yalnız nakitten, hatalar", () => {
  assert.deepEqual(settle(38500, [{ method: "kart", amount: 38500 }]), { ok: true, payments: [{ method: "kart", amount: 38500 }], paid: 38500, change: 0 });
  const k = settle(38500, [{ method: "kart", amount: 20000 }, { method: "nakit", amount: 10000 }, { method: "nakit", amount: 10000 }]);
  assert.deepEqual(k, { ok: true, payments: [{ method: "kart", amount: 20000 }, { method: "nakit", amount: 20000 }], paid: 40000, change: 1500 });
  assert.match((settle(38500, [{ method: "kart", amount: 40000 }]) as { error: string }).error, /aşamaz/);
  assert.match((settle(38500, [{ method: "nakit", amount: 30000 }]) as { error: string }).error, /Eksik ödeme: 85,00 ₺/);
  assert.match((settle(100, [{ method: "nakit", amount: -5 }]) as { error: string }).error, /Geçersiz tutar/);
  assert.match((settle(100, []) as { error: string }).error, /Eksik ödeme/);
});

test("vardiya özeti: yöntem bazında, net nakit, beklenen kasa, KDV", () => {
  const s = summarizeShift(50000, [
    { total: 38500, change: 1500, payments: [{ method: "kart", amount: 20000 }, { method: "nakit", amount: 20000 }], vat: [{ rate: 10, gross: 38500, net: 35000, vat: 3500 }] },
    { total: 1000, change: 0, payments: [{ method: "nakit", amount: 1000 }], vat: [{ rate: 20, gross: 1000, net: 833, vat: 167 }] },
  ]);
  assert.equal(s.saleCount, 2);
  assert.equal(s.gross, 39500);
  assert.deepEqual(s.byMethod, { nakit: 19500, kart: 20000, yemek_karti: 0, online: 0, hediye_karti: 0 });
  assert.equal(s.expectedCash, 69500);
  assert.deepEqual(s.vat.map((v) => [v.rate, v.gross, v.vat]), [[10, 38500, 3500], [20, 1000, 167]]);
});
