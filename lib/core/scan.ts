// lib/core/scan.ts — Kasa okutma çözümü (saf): barkod, terazi etiketi (EAN-13, 27/28/29 + PLU + gram), çarpan "5*".
import type { KasaProduct } from "@/lib/offline/state";

export function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/** v1 yalnız ağırlık kodlu etiket: 2[789] + 5 hane PLU + 5 hane gram + kontrol. */
export function parseScaleBarcode(code: string): { plu: string; grams: number } | null {
  if (!/^2[789]\d{11}$/.test(code) || !ean13Valid(code)) return null;
  const grams = Number(code.slice(7, 12));
  return grams > 0 ? { plu: code.slice(2, 7), grams } : null;
}

export function parseScanInput(raw: string): { qty: number; code: string } {
  const m = /^\s*(\d{1,3})\s*\*\s*(.*?)\s*$/.exec(raw);
  return m ? { qty: Number(m[1]), code: m[2] } : { qty: 1, code: raw.trim() };
}

/** "0,75" / "0.75" / "1" (kg) → gram. En çok 3 ondalık, 0 < kg ≤ 1000. */
export function parseKg(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t)) return null;
  const [int, frac = ""] = t.split(".");
  const g = Number(int) * 1000 + Number(frac.padEnd(3, "0"));
  return g > 0 && g <= 1_000_000 ? g : null;
}

export type ScanIndex = { byBarcode: Map<string, KasaProduct>; byPlu: Map<string, KasaProduct> };

export function buildIndex(products: KasaProduct[]): ScanIndex {
  const byBarcode = new Map<string, KasaProduct>();
  const byPlu = new Map<string, KasaProduct>();
  for (const p of products) {
    for (const b of p.barcodes) byBarcode.set(b, p);
    if (p.plu) byPlu.set(p.plu, p);
  }
  return { byBarcode, byPlu };
}

export type ScanResult = { product: KasaProduct; qtyMilli: number } | { weigh: KasaProduct } | { error: string };

export function resolveScan(raw: string, ix: ScanIndex): ScanResult {
  const { qty, code } = parseScanInput(raw);
  if (qty < 1) return { error: "Çarpan 1-999 olmalı." };
  const direct = ix.byBarcode.get(code);
  if (!direct) {
    const scale = parseScaleBarcode(code);
    if (scale) {
      const p = ix.byPlu.get(scale.plu);
      if (!p || p.kind !== "tartili") return { error: `Terazi ürünü bulunamadı (PLU ${scale.plu}).` };
      if (qty !== 1) return { error: "Tartılı üründe çarpan kullanılmaz." };
      return { product: p, qtyMilli: scale.grams };
    }
    return { error: `Barkod bulunamadı: ${code}` };
  }
  if (direct.kind === "tartili") return qty === 1 ? { weigh: direct } : { error: "Tartılı üründe çarpan kullanılmaz." };
  return { product: direct, qtyMilli: qty * 1000 };
}
