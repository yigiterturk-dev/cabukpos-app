// tests/catalog.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProduct } from "@/lib/admin/catalog";

test("ürün doğrulama: TL fiyat, KDV oranı, barkod listesi", () => {
  const ok = parseProduct({ name: " Ayran ", price: "25,00", vatRate: "10", categoryId: "", barcodes: "8690000000011, 8690000000011\n123" });
  assert.deepEqual(ok, { ok: true, value: { name: "Ayran", price: 2500, vatRate: 10, categoryId: null, barcodes: ["8690000000011", "123"], kind: "adet", plu: null, trackStock: false, quick: false, sellable: true, unit: "adet", cost: null, minStock: null, yieldMilli: null } });
  const w = parseProduct({ name: "Domates", price: "80", vatRate: "1", categoryId: "", barcodes: "", kind: "tartili", plu: "12345", trackStock: "on", quick: "on" });
  assert.deepEqual(w.ok && w.value, { name: "Domates", price: 8000, vatRate: 1, categoryId: null, barcodes: [], kind: "tartili", plu: "12345", trackStock: true, quick: true, sellable: true, unit: "kg", cost: null, minStock: null, yieldMilli: null });
  const bad = (o: Record<string, string>, field: string) => {
    const r = parseProduct({ name: "Ayran", price: "25", vatRate: "10", categoryId: "", barcodes: "", ...o });
    assert.ok(!r.ok && r.field === field, JSON.stringify(r));
  };
  bad({ name: "A" }, "name");
  bad({ price: "abc" }, "price");
  bad({ price: "0" }, "price");
  bad({ vatRate: "8" }, "vatRate");
  bad({ categoryId: "x" }, "categoryId");
  bad({ barcodes: "12 34" }, "barcodes");
  bad({ kind: "kutu" }, "kind");
  bad({ kind: "tartili", plu: "123" }, "plu");
  bad({ kind: "adet", plu: "12345" }, "plu");
  // M7: hammadde / ara ürün
  const raw = parseProduct({ name: "Kıyma", price: "", vatRate: "1", categoryId: "", barcodes: "", sellable: "false", unit: "kg", cost: "400,00", minStock: "1,5", yieldMilli: "", kind: "tartili", plu: "12345", quick: "on" });
  assert.deepEqual(raw.ok && raw.value, { name: "Kıyma", price: 0, vatRate: 1, categoryId: null, barcodes: [], kind: "adet", plu: null, trackStock: true, quick: false, sellable: false, unit: "kg", cost: 40000, minStock: 1500, yieldMilli: null });
  const harc = parseProduct({ name: "Harç", price: "", categoryId: "", barcodes: "", sellable: "false", unit: "kg", yieldMilli: "1" });
  assert.equal(harc.ok && harc.value.yieldMilli, 1000);
  bad({ sellable: "false", unit: "ton" }, "unit");
  bad({ cost: "x" }, "cost");
  bad({ sellable: "false", unit: "adet", minStock: "1,5" }, "minStock");
  bad({ sellable: "false", unit: "lt", yieldMilli: "0" }, "yieldMilli");
});
