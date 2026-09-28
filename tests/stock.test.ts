// tests/stock.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { stockLevel } from "@/lib/core/stock";
import { ean13Modules } from "@/lib/core/ean13";
import { summarizeShift } from "@/lib/core/shift";

const at = (m: number) => new Date(Date.UTC(2026, 8, 28, 10, m)).toISOString();

test("stok: sayım yoksa toplam", () => {
  assert.equal(stockLevel([{ kind: "alis", qtyMilli: 10000, at: at(0) }, { kind: "satis", qtyMilli: -3000, at: at(1) }, { kind: "iade", qtyMilli: 1000, at: at(2) }]), 8000);
  assert.equal(stockLevel([]), 0);
});

test("stok: sayım mutlak, öncesi yok sayılır", () => {
  const moves = [
    { kind: "alis" as const, qtyMilli: 10000, at: at(0) },
    { kind: "sayim" as const, qtyMilli: 20000, at: at(5) },
    { kind: "satis" as const, qtyMilli: -3000, at: at(6) },
    { kind: "satis" as const, qtyMilli: -2000, at: at(4) }, // çevrimdışı, sayımdan önce yapılmış, sonra eşitlenmiş
  ];
  assert.equal(stockLevel(moves), 17000);
  assert.equal(stockLevel([...moves, { kind: "sayim", qtyMilli: 5000, at: at(7) }, { kind: "fire", qtyMilli: -1000, at: at(8) }]), 4000);
});

test("EAN-13 modülleri", () => {
  const m = ean13Modules("5901234123457")!;
  assert.equal(m.length, 95);
  assert.ok(m.startsWith("101") && m.endsWith("101"));
  assert.equal(m.slice(45, 50), "01010");
  // İlk hane 5 → sol parite LGGLLG. "9" L = 0001011, "0" G = 0100111
  assert.equal(m.slice(3, 10), "0001011");
  assert.equal(m.slice(10, 17), "0100111");
  // Sağ: "1" R = 1100110, son "7" R = 1000100
  assert.equal(m.slice(50, 57), "1100110");
  assert.equal(m.slice(85, 92), "1000100");
  assert.equal(ean13Modules("5901234123458"), null);
});

test("gün sonu iadeyi düşer", () => {
  const s = summarizeShift(10000, [
    { total: 10000, change: 0, payments: [{ method: "nakit", amount: 10000 }], vat: [{ rate: 10, gross: 10000, net: 9091, vat: 909 }] },
    { refund: true, total: 3000, change: 0, payments: [{ method: "nakit", amount: 3000 }], vat: [{ rate: 10, gross: 3000, net: 2727, vat: 273 }] },
  ]);
  assert.equal(s.saleCount, 1);
  assert.equal(s.refundCount, 1);
  assert.equal(s.refundTotal, 3000);
  assert.equal(s.gross, 7000);
  assert.equal(s.byMethod.nakit, 7000);
  assert.equal(s.expectedCash, 17000);
  assert.deepEqual(s.vat, [{ rate: 10, gross: 7000, net: 6364, vat: 636 }]);
});
