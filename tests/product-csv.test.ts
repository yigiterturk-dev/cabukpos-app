import assert from "node:assert/strict";
import test from "node:test";
import { parseProductCsv } from "@/lib/core/product-csv";

test("ürün CSV: Türkçe başlıklar ve tırnaklı virgüllü fiyat okunur", () => {
  const result = parseProductCsv("\uFEFFÜrün adı,Fiyat (TL),KDV,Kategori,Barkod,Stok takibi\r\nAdana Dürüm,\"180,00\",10,Yemek,8690000000011,Evet\r\n");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.rows[0], {
    line: 2, name: "Adana Dürüm", price: "180,00", vatRate: "10", category: "Yemek",
    barcodes: "8690000000011", kind: "", plu: "", trackStock: "Evet", quick: "", sellable: "", unit: "", cost: "", minStock: "", yieldMilli: "",
  });
});

test("ürün CSV: zorunlu başlıklar yoksa aktarımı reddeder", () => {
  assert.deepEqual(parseProductCsv("Kategori,Fiyat\nYemek,10\n"), { ok: false, error: "CSV'de Ürün adı ve Fiyat (TL) sütunları zorunlu." });
  assert.deepEqual(parseProductCsv("Ürün adı,Kategori\nSu,İçecek\n"), { ok: false, error: "CSV'de Ürün adı ve Fiyat (TL) sütunları zorunlu." });
});
