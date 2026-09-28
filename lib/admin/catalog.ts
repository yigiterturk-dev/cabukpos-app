// lib/admin/catalog.ts — Ürün formu doğrulaması (saf).
import { isVatRate, parseTL, type VatRate } from "@/lib/core/money";
import { parseQty, STOCK_UNITS, type StockUnit } from "@/lib/core/stock";

export type ProductValue = { name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[]; kind: "adet" | "tartili"; plu: string | null; trackStock: boolean; quick: boolean;
  /** M7: false = hammadde / ara ürün (kasada yok, stok takipli). cost kuruş/birim, minStock ve yieldMilli qtyMilli. */
  sellable: boolean; unit: StockUnit; cost: number | null; minStock: number | null; yieldMilli: number | null };
type Out = { ok: true; value: ProductValue } | { ok: false; error: string; field: string };
const UUID = /^[0-9a-f-]{36}$/i;

const on = (v?: string) => v === "on" || v === "true";

export function parseProduct(f: Record<string, string>): Out {
  const name = (f.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Ürün adı 2-80 karakter.", field: "name" };
  const sellable = f.sellable === undefined || f.sellable === "" || on(f.sellable);
  const price = !sellable && !(f.price ?? "").trim() ? 0 : parseTL(f.price ?? "");
  if (price === null || (sellable && price <= 0) || price < 0 || price > 10_000_000) return { ok: false, error: "Fiyat geçersiz (ör. 25,00).", field: "price" };
  const vat = !sellable && !f.vatRate ? 1 : Number(f.vatRate); // hammaddede KDV kullanılmaz
  if (!isVatRate(vat)) return { ok: false, error: "KDV oranı %1, %10 ya da %20 olmalı.", field: "vatRate" };
  const categoryId = (f.categoryId ?? "").trim() || null;
  if (categoryId && !UUID.test(categoryId)) return { ok: false, error: "Kategori geçersiz.", field: "categoryId" };
  const parts = (f.barcodes ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (parts.some((b) => !/^\d{3,14}$/.test(b))) return { ok: false, error: "Barkod yalnız rakam (3-14 hane); virgül ya da satırla ayırın.", field: "barcodes" };
  const kind = f.kind || "adet";
  if (kind !== "adet" && kind !== "tartili") return { ok: false, error: "Ürün türü geçersiz.", field: "kind" };
  const plu = (f.plu ?? "").trim() || null;
  if (plu && kind !== "tartili") return { ok: false, error: "PLU yalnız tartılı üründe.", field: "plu" };
  if (plu && !/^\d{5}$/.test(plu)) return { ok: false, error: "PLU 5 hane rakam (terazideki ürün kodu).", field: "plu" };
  const unit = sellable ? (kind === "tartili" ? "kg" : "adet") : ((f.unit || "adet") as StockUnit);
  if (!STOCK_UNITS.includes(unit)) return { ok: false, error: "Birim geçersiz.", field: "unit" };
  const cost = (f.cost ?? "").trim() ? parseTL(f.cost) : null;
  if ((f.cost ?? "").trim() && (cost === null || cost > 10_000_000)) return { ok: false, error: "Maliyet geçersiz (ör. 20,00).", field: "cost" };
  const qtyErr = unit === "adet" ? "tam sayı" : `${unit} (ör. 2,5)`;
  const minStock = (f.minStock ?? "").trim() ? parseQty(f.minStock, unit, true) : null;
  if ((f.minStock ?? "").trim() && minStock === null) return { ok: false, error: `Kritik sınır ${qtyErr} olmalı.`, field: "minStock" };
  const yieldMilli = !sellable && (f.yieldMilli ?? "").trim() ? parseQty(f.yieldMilli, unit) : null;
  if (!sellable && (f.yieldMilli ?? "").trim() && yieldMilli === null) return { ok: false, error: `Parti miktarı ${qtyErr} olmalı.`, field: "yieldMilli" };
  return { ok: true, value: {
    name, price, vatRate: vat, categoryId, barcodes: [...new Set(parts)], kind: sellable ? kind : "adet", plu: sellable ? plu : null,
    trackStock: sellable ? on(f.trackStock) : true, quick: sellable && on(f.quick), sellable, unit, cost, minStock, yieldMilli,
  } };
}
