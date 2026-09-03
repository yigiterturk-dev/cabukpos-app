// Dağıtık rate limit — DB sayacı (db/rate-limit.sql), in-memory geri düşüşlü.
//
// NEDEN DB: serverless'te in-memory sayaç her cold start'ta sıfırlanır ve her instance
// kendi sayacını tutar; brute-force instance'lara dağılınca limit hiç dolmaz.
// rl_hit() tek atomik SQL adımıdır (pencere kaydırma + artırma + karar).
//
// GERİ DÜŞÜŞ: rate_limits tablosu/fonksiyonu henüz uygulanmamış bir veritabanında
// (migration atılmadıysa) sorgu patlar. O durumda giriş akışını KIRMAMAK için
// süreç-içi sayaca düşeriz — zayıf ama sıfırdan iyi — ve bir kez uyarı loglarız.

import { headers } from "next/headers";
import { sql } from "drizzle-orm";

import { db } from "@/db";

export type RateLimitRule = {
  /** Pencere uzunluğu (ms). */
  windowMs: number;
  /** Pencere başına izin verilen deneme sayısı. */
  max: number;
};

// --- Geri düşüş: süreç-içi sayaç ---
const memStore: Map<string, number[]> = (
  globalThis as unknown as { __yposRL?: Map<string, number[]> }
).__yposRL ??= new Map();

let dbUnavailableWarned = false;

function memLimited(key: string, rule: RateLimitRule): boolean {
  const now = Date.now();
  const list = (memStore.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (list.length >= rule.max) {
    memStore.set(key, list);
    return true;
  }
  list.push(now);
  memStore.set(key, list);
  return false;
}

/**
 * Sayacı artırır ve limit aşıldıysa true döner (= isteği ENGELLE).
 * Hata durumunda fail-open değil, in-memory sayaca düşer.
 */
export async function rateLimited(key: string, rule: RateLimitRule): Promise<boolean> {
  const windowSeconds = Math.max(1, Math.round(rule.windowMs / 1000));
  try {
    const res = (await db.execute(
      sql`SELECT rl_hit(${key}, ${windowSeconds}, ${rule.max}) AS limited`
    )) as unknown as { rows: Array<{ limited: boolean }> };
    // Sayaçlar birikmesin: ~%1 ihtimalle eski kayıtları topla.
    if (Math.random() < 0.01) {
      void db.execute(sql`SELECT rl_gc()`).catch(() => {});
    }
    return res.rows?.[0]?.limited === true;
  } catch (e) {
    if (!dbUnavailableWarned) {
      dbUnavailableWarned = true;
      console.warn(
        "[rate-limit] DB sayacı kullanılamıyor, süreç-içi sayaca düşüldü. " +
          "db/rate-limit.sql uygulandı mı? Sebep:",
        e instanceof Error ? e.message : e
      );
    }
    return memLimited(key, rule);
  }
}

/** Başarılı işlem sonrası sayacı temizler (ör. doğru şifreyle giriş). */
export async function resetRateLimit(key: string): Promise<void> {
  memStore.delete(key);
  try {
    await db.execute(sql`SELECT rl_reset(${key})`);
  } catch {
    /* tablo yoksa yapacak bir şey yok */
  }
}

/**
 * İstemci IP'si.
 *
 * 🔴 BURADA X-Forwarded-For'un İLK DEĞERİNİ ALMAYIN. İstemci kendi XFF başlığını
 * gönderebilir; vekil sunucu gerçek IP'yi bu zincire EKLER. İlk değeri almak,
 * saldırganın her istekte farklı sahte IP yazarak rate limit'i tamamen atlaması
 * demektir (bir kez böyle yazıldı, denetim yakaladı).
 *
 * Sıra:
 *   1) x-vercel-forwarded-for — Vercel'in kendi yazdığı, istemcinin ezemediği değer
 *   2) x-real-ip              — vekilin yazdığı tekil değer
 *   3) x-forwarded-for'un SON değeri — zincire en son, yani en yakın vekil ekler
 *
 * Hiçbiri yoksa "unknown" döner; o durumda tüm anonim istekler AYNI sayacı
 * paylaşır — güvenli taraf (bypass değil, ortak limit).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();

  const vercel = h.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel.split(",")[0]!.trim();

  const real = h.get("x-real-ip")?.trim();
  if (real) return real;

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }

  return "unknown";
}

// --- Kurallar (tek yerde, ayarlanabilir) ---
export const RL = {
  /** Giriş: IP başına 10/15dk — insan kullanıcıyı zorlamaz, brute-force'u öldürür. */
  login: { windowMs: 15 * 60 * 1000, max: 10 } as RateLimitRule,
  /** Giriş: hesap başına 5/15dk — tek hesabı hedefleyen dağıtık denemeye karşı. */
  loginAccount: { windowMs: 15 * 60 * 1000, max: 5 } as RateLimitRule,
  /** Kayıt: IP başına 5/saat — sahte işletme spam'ini keser. */
  signup: { windowMs: 60 * 60 * 1000, max: 5 } as RateLimitRule,
  /** Public rezervasyon: IP+slug başına 5/saat (mevcut davranışla aynı). */
  booking: { windowMs: 60 * 60 * 1000, max: 5 } as RateLimitRule,
} as const;
