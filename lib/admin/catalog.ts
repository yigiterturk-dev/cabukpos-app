// lib/admin/catalog.ts — Ürün formu doğrulaması (saf).
import { isVatRate, parseTL, type VatRate } from "@/lib/core/money";

type Out = { ok: true; value: { name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[] } } | { ok: false; error: string; field: string };
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
  return { ok: true, value: { name, price, vatRate: vat, categoryId, barcodes: [...new Set(parts)] } };
}
