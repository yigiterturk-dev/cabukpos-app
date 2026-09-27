// lib/core/money.ts — Saf para yardımcıları. Tutarlar tamsayı kuruş, fiyatlar KDV dahil.
export type Kurus = number;
export const VAT_RATES = [1, 10, 20] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const isVatRate = (n: number): n is VatRate => (VAT_RATES as readonly number[]).includes(n);

/** "12,50", "12.5", "1.234,56", "7 ₺" → kuruş. Negatif, 2'den fazla kuruş hanesi ya da çöp → null. */
export function parseTL(input: string): Kurus | null {
  let s = input.replace(/[\s₺]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

const fmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatTL = (k: Kurus) => `${fmt.format(k / 100)} ₺`;

/** KDV dahil tutardan net + KDV (net yuvarlanır, KDV = fark → toplam her zaman tutar). */
export function splitVat(gross: Kurus, rate: VatRate): { net: Kurus; vat: Kurus } {
  const net = Math.round((gross * 100) / (100 + rate));
  return { net, vat: gross - net };
}
