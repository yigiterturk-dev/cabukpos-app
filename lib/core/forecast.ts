// lib/core/forecast.ts — Kanıta dayalı talep tahmini (saf hesap).
//
// Prensip: gözlenen günlük veriden basit istatistik türetir; sihirli "ML" yok.
// Az veri varsa tahmin ÜRETMEZ (insufficient). Aralık her zaman bir güven
// düzeyiyle verilir ve aralığın dışında kesinlik iddia edilmez. Bu katman
// Laya (harici) yokken de çalışır; Laya bağlandığında onun kanıtlı çıktısı
// yine bu yerel tabanın yerini alabilir.

export type DailyPoint = { date: string; gross: number; orders: number };

export type Forecast = {
  /** Tahmin gün sayısı (varsayılan 7). */
  horizonDays: number;
  /** Geçmiş penceresinde kullanılan tam gün sayısı. */
  basisDays: number;
  /** Günlük brüt ortalama (kuruş). */
  dailyMean: number;
  /** Günlük standart sapma (kuruş). */
  dailyStd: number;
  /** Dönem toplamı tahmini (kuruş). */
  periodEstimate: number;
  /** ~%80 güven aralığı [alt, üst] (kuruş). */
  low: number;
  high: number;
  /** Günlük eğilim: son günler artıyor mu azalıyor mu. */
  trend: "artiyor" | "azaliyor" | "duz";
  /** Gözlenen toplam (aynı pencere, karşılaştırma için). */
  observedTotal: number;
  basisOrders: number;
};

/** Yalnız son `days` günün toplamı (gün sınırına göre sıralı kabul edilir). */
const MIN_BASIS_DAYS = 14;
const MIN_ACTIVE_DAYS = 7; // en az 7 günde satış olmalı, yoksa veri seyrek

function stdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Son günlerin günlük brüt toplamından önümüzdeki dönemi tahmin eder.
 * @param daily son günler; tarih sırası önemsiz (kendi sıralar).
 * @param horizonDays tahmin ufku (varsayılan 7).
 */
export function forecastGross(daily: DailyPoint[], horizonDays = 7): Forecast | null {
  const points = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < MIN_BASIS_DAYS) return null;
  const basis = points.slice(-28);
  const active = basis.filter((p) => p.gross > 0);
  if (active.length < MIN_ACTIVE_DAYS) return null;

  const values = basis.map((p) => Math.max(0, Math.round(p.gross)));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = stdev(values, mean);
  const periodEstimate = Math.round(mean * horizonDays);
  // ~%80: 1.2816 z; toplamın standart hatası sqrt(horizon) * günlük std.
  const margin = Math.round(1.2816 * std * Math.sqrt(horizonDays));
  const low = Math.max(0, periodEstimate - margin);
  const high = periodEstimate + margin;

  // Eğilim: pencerenin ilk yarısına göre ikinci yarısının günlük ortalaması.
  const half = Math.floor(values.length / 2);
  const firstAvg = values.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
  const secondAvg = values.slice(values.length - half).reduce((s, v) => s + v, 0) / Math.max(1, half);
  const delta = secondAvg - firstAvg;
  const threshold = 0.1 * (mean || 1);
  const trend: Forecast["trend"] = delta > threshold ? "artiyor" : delta < -threshold ? "azaliyor" : "duz";

  return {
    horizonDays,
    basisDays: basis.length,
    dailyMean: Math.round(mean),
    dailyStd: Math.round(std),
    periodEstimate,
    low,
    high,
    trend,
    observedTotal: Math.round(values.reduce((s, v) => s + v, 0)),
    basisOrders: basis.reduce((s, p) => s + Math.max(0, Math.round(p.orders)), 0),
  };
}
