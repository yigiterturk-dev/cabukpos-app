// lib/loyalty.ts — #33: Sadakat puanı + kupon hesapları. Saf fonksiyonlar; UI ve satış akışı ortak kullanır.
import type { Kurus } from "./core/money";
import { endOfStoredIstanbulDay } from "./core/date";

export type CouponLike = {
  kind: "yuzde" | "tutar" | "teslimat";
  value: number; // yuzde: 1-100; tutar: kuruş; teslimat: 0
  minSubtotal: Kurus;
  maxDiscount: Kurus | null; // yuzde üst sınırı; null = sınırsız
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number;
  usedCount: number;
};

export type CouponResult = { ok: true; discount: Kurus } | { ok: false; reason: string };

/** Kuponu aratınca sepette uygulanabilir mi? discount = ara toplamdan düşülecek kuruş (teslimatta 0). */
export function couponCheck(c: CouponLike, subtotal: Kurus, now = new Date(), customerUsed = 0): CouponResult {
  if (c.startsAt && now < c.startsAt) return { ok: false, reason: "Kupon henüz başlamadı." };
  if (c.endsAt && now > endOfStoredIstanbulDay(c.endsAt)) return { ok: false, reason: "Kuponun süresi doldu." };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { ok: false, reason: "Kupon kullanım limiti doldu." };
  if (customerUsed >= c.perCustomerLimit) return { ok: false, reason: "Bu kuponu kullanma hakkınız doldu." };
  if (subtotal < c.minSubtotal) return { ok: false, reason: "Bu kupon en az " + (c.minSubtotal / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺ sepet gerektirir." };
  if (c.kind === "teslimat") return { ok: true, discount: 0 };
  if (c.kind === "yuzde") {
    const raw = Math.floor((subtotal * c.value) / 100);
    const discount = c.maxDiscount !== null ? Math.min(raw, c.maxDiscount) : raw;
    return { ok: true, discount };
  }
  return { ok: true, discount: Math.min(c.value, subtotal) };
}

/** Kasadan satışa eklenen sadakat verileri (yerel kayıt + eşitleme belgesi ortak). */
export type SaleExtrasInput = {
  customerId?: string | null;
  coupon?: { code: string; discount: number };
  loyalty?: { customerId: string; points: number; discount: number };
  giftCard?: { code: string; amount: number };
};

/** Satış düzeyi toplam indirim: parçalar (kupon + puan) ara toplamı aşamaz, negatif parça 0 sayılır. */
export function capDiscount(subtotal: Kurus, parts: Kurus[]): Kurus {
  return Math.min(Math.max(0, subtotal), parts.reduce((a, p) => a + Math.max(0, p), 0));
}

/** Harcamadan kazanılan puan (kurusPerPoint ≤ 0 → kapalı say, 0 puan). */
export const pointsEarned = (total: Kurus, kurusPerPoint: number) =>
  kurusPerPoint > 0 ? Math.floor(total / kurusPerPoint) : 0;

/** Puanın para değeri (kuruş) ve verilen indirim için harcanacak puan (aşağı yuvarlar). */
export const pointsValue = (points: number, kurusPerRedeem: number): Kurus => points * kurusPerRedeem;
export const pointsForKurus = (kurus: Kurus, kurusPerRedeem: number) =>
  kurusPerRedeem > 0 ? Math.floor(kurus / kurusPerRedeem) : 0;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // okunması karışan 0/O/1/I yok

/** HK-XXXXXX biçiminde hediye kartı kodu (benzersizlik DB tekil indeksiyle garanti).
 *  Parasal kod CSPRNG ile üretilir — derin tarama bulgusu #8 (Math.random değil). */
export function newGiftCardCode(): string {
  const rnd = new Uint32Array(6);
  crypto.getRandomValues(rnd);
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[rnd[i] % CODE_ALPHABET.length];
  return "HK-" + s;
}

/** Kupon kodu normalize: boşluk sil, büyük harf; en az 3 en çok 24 karakter. */
export function normalizeCouponCode(input: string): string | null {
  if (input.length > 48) return null;
  const code = input.toUpperCase().replace(/[\s-]+/g, "");
  return code.length >= 3 && code.length <= 24 && /^[A-Z0-9]+$/.test(code) ? code : null;
}
