// tests/catalog.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProduct } from "@/lib/admin/catalog";

test("ürün doğrulama: TL fiyat, KDV oranı, barkod listesi", () => {
  const ok = parseProduct({ name: " Ayran ", price: "25,00", vatRate: "10", categoryId: "", barcodes: "8690000000011, 8690000000011\n123" });
  assert.deepEqual(ok, { ok: true, value: { name: "Ayran", price: 2500, vatRate: 10, categoryId: null, barcodes: ["8690000000011", "123"], kind: "adet", plu: null, trackStock: false, quick: false } });
  const w = parseProduct({ name: "Domates", price: "80", vatRate: "1", categoryId: "", barcodes: "", kind: "tartili", plu: "12345", trackStock: "on", quick: "on" });
  assert.deepEqual(w.ok && w.value, { name: "Domates", price: 8000, vatRate: 1, categoryId: null, barcodes: [], kind: "tartili", plu: "12345", trackStock: true, quick: true });
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
});
