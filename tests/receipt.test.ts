import { test } from "node:test";
import assert from "node:assert/strict";

// #38 SMS fiş metni
import { receiptSmsText } from "../lib/core/receipt";

test("receiptSmsText: başlık + satırlar + toplam, 1x yazılmaz", () => {
  const t = receiptSmsText({ storeName: "Kardeşler Market", receiptNo: "MK-000123", at: "2026-10-03T11:00:00Z", total: 4550, lines: [
    { name: "Ekmek", qtyMilli: 2000 }, { name: "Süt", qtyMilli: 1000 },
  ] });
  assert.ok(t.startsWith("Kardeşler Market · Fiş MK-000123 · "));
  assert.ok(t.includes("2x Ekmek, Süt"));
  assert.ok(t.endsWith("TOPLAM: 45,50 ₺"));
  assert.ok(t.length <= 320);
});

test("receiptSmsText: satır listesi max'a taşarsa … ile kırpılır ama toplam her zaman yazılır", () => {
  const t = receiptSmsText({ storeName: "M", receiptNo: "F-1", at: "2026-10-03T11:00:00Z", total: 100, lines: Array.from({ length: 60 }, (_, i) => ({ name: `Ürün ${i + 1}`, qtyMilli: 1000 })) }, 200);
  assert.ok(t.endsWith("TOPLAM: 1,00 ₺"));
  assert.ok(t.includes("…"));
  assert.ok(t.length <= 200);
});
