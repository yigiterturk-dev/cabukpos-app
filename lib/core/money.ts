// lib/core/money.ts — Saf para yardımcıları. Tutarlar tamsayı kuruş, fiyatlar KDV dahil.
export type Kurus = number;
export const VAT_RATES = [1, 10, 20] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const isVatRate = (n: number): n is VatRate => (VAT_RATES as readonly number[]).includes(n);

/** "12,50", "12.5", "1.234,56", "7 ₺" → kuruş. Negatif, 2'den fazla kuruş hanesi ya da çöp → null. */
export function parseTL(input: string): Kurus | null {
  let s = input.replace(/[\s₺$€£]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

/** Biçimli tutarı (sonekli de olur: "12,50 ₺", "12,50 USD", "₺12,50") kuruşa çözer; parseTL'nin para birimi duyarlısı. */
export function parseMoney(input: string): Kurus | null {
  return parseTL(input.replace(/(TL|TRY|USD|EUR|GBP)/gi, ""));
}

const fmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatTL = (k: Kurus) => `${fmt.format(k / 100)} ₺`;
/** Sembolsüz ikili biçim — form input defaultValue'ları için. */
export const formatPlain = (k: Kurus) => fmt.format(k / 100);

// — Çoklu para birimi altyapısı (#16) —
// Kuruş tamsayısı para biriminden bağımsız kalır (kırk kuruş = 2 haneli; adım ileride
// JPY gibi 0 haneli birim gerekirse minorUnit buraya eklenir). İşletmenin para birimi
// `tenants.currency`'den gelecek (şema müdürde); gelene dek her yer TRY.
export type Currency = "TRY" | "USD" | "EUR" | "GBP";
export const CURRENCIES: Record<Currency, { ad: string }> = {
  TRY: { ad: "Türk lirası" },
  USD: { ad: "Amerikan doları" },
  EUR: { ad: "Euro" },
  GBP: { ad: "İngiliz sterlini" },
};
export const isCurrency = (s: unknown): s is Currency => typeof s === "string" && s in CURRENCIES;

const currencyFmt = new Map<Currency, Intl.NumberFormat>();
/** "₺12,50" biçimi Intl'in tr-TR çıktısıdır; fiş/ekrandaki "12,50 ₺" için formatTL kalır. */
export function formatMoney(k: Kurus, c: Currency = "TRY"): string {
  let f = currencyFmt.get(c);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", { style: "currency", currency: c, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    currencyFmt.set(c, f);
  }
  return f.format(k / 100);
}

/** Birim fiyat/oran etiketleri için çıplak sembol ("₺", "$", "€", "£"). */
export function currencySymbol(c: Currency): string {
  const part = new Intl.NumberFormat("tr-TR", { style: "currency", currency: c, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency");
  return part?.value ?? c;
}

/** Fiş tarzı sonekli biçim. TRY "12,50 ₺" (yazıcıda "TL"); TRY dışı ISO koduyla "12,50 USD" —
 *  €/£ PC857'de yok, $ ise belirsiz; kod son eki her kod sayfasında basılır. */
export function formatReceipt(k: Kurus, c: Currency = "TRY"): string {
  return `${fmt.format(k / 100)} ${c === "TRY" ? "₺" : c}`;
}

/** KDV dahil tutardan net + KDV (net yuvarlanır, KDV = fark → toplam her zaman tutar). */
export function splitVat(gross: Kurus, rate: VatRate): { net: Kurus; vat: Kurus } {
  const net = Math.round((gross * 100) / (100 + rate));
  return { net, vat: gross - net };
}
