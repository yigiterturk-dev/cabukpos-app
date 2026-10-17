// lib/admin/forecast.ts — Talep tahmini: son günlerin DB özetini saf çekirdeğe verir.
import type { Tx } from "@/db";
import { istToday } from "@/lib/core/report";
import { dailyStatsData } from "@/lib/admin/report";
import { forecastGross, type DailyPoint, type Forecast } from "@/lib/core/forecast";

const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * Son 5 haftanın günlük brüt cirosundan önümüzdeki 7 günü tahmin eder.
 * Satışsız günler 0 kabul edilir (standart sapma gerçekçi olsun diye boşluk doldurulur).
 */
export async function demandForecast(tx: Tx, storeId?: string | null, now = Date.now()): Promise<Forecast | null> {
  const bit = istToday(now);
  const bas = shift(bit, -34);
  const days = await dailyStatsData(tx, { bas, bit }, storeId);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const daily: DailyPoint[] = [];
  for (let d = bas; d <= bit; d = shift(d, 1)) {
    const x = byDay.get(d);
    daily.push({ date: d, gross: x ? Math.round(x.grossRevenue * 100) : 0, orders: x?.orderCount ?? 0 });
  }
  return forecastGross(daily, 7);
}
