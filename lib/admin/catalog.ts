// lib/admin/catalog.ts — Ürün formu doğrulaması (saf).
import { isVatRate, parseTL, type VatRate } from "@/lib/core/money";

export type ProductValue = { name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[]; kind: "adet" | "tartili"; plu: string | null; trackStock: boolean; quick: boolean };
type Out = { ok: true; value: ProductValue } | { ok: false; error: string; field: string };
const UUID = /^[0-9a-f-]{36}$/i;

export function parseProduct(f: Record<string, string>): Out {
  const name = (f.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Ürün adı 2-80 karakter.", field: "name" };
  const price = parseTL(f.price ?? "");
  if (price === null || price <= 0 || price > 10_000_000) return { ok: false, error: "Fiyat geçersiz (ör. 25,00).", field: "price" };
  const vat = Number(f.vatRate);
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
  const on = (v?: string) => v === "on" || v === "true";
  return { ok: true, value: { name, price, vatRate: vat, categoryId, barcodes: [...new Set(parts)], kind, plu, trackStock: on(f.trackStock), quick: on(f.quick) } };
}
