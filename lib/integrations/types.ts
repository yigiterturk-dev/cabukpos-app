/**
 * Online sipariş entegrasyonları — normalleştirilmiş sipariş modeli.
 *
 * Platformlar (TGO/Uber Eats, Yemeksepeti) kendi ham şemalarında sipariş gönderir;
 * parse.ts bunları bu ortak şekle indirger, ingest katmanı adisyona yazar.
 * Gerçek payload alanları partner onayı sonrası portal dokümanından birebir doğrulanır;
 * parse katmanı bu yüzden savunmacı yazıldı (birden çok olası alan adını tarar).
 */

export const PLATFORMS = ["tgo", "yemeksepeti"] as const;
export type PlatformId = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<PlatformId, string> = {
  tgo: "Trendyol Go / Uber Eats",
  yemeksepeti: "Yemeksepeti",
};

export function isPlatform(v: string): v is PlatformId {
  return (PLATFORMS as readonly string[]).includes(v);
}

export interface NormalizedOrderItem {
  name: string;
  qty: number;
  unitPrice?: number;
  /** Platform barkod/PLU veriyorsa ürün eşlemesi birebir yapılır. */
  barcode?: string;
}

export interface NormalizedOrder {
  /** Platform sipariş numarası — idempotensi anahtarı (platform + external_id benzersiz). */
  externalId: string;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  /** "online_odeme" | "kapida" gibi kısa ödeme durumu notu */
  paymentNote?: string;
  items: NormalizedOrderItem[];
  /** ISO tarih — gelmezse alındığı an kullanılır. */
  placedAt?: string;
}
