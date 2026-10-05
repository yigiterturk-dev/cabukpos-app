// tests/forecast.test.ts — #35: kanıta dayalı tahmin çekirdeği.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastGross, type DailyPoint } from "@/lib/core/forecast";

const day = (i: number) => new Date(Date.parse("2026-01-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
const series = (vals: number[]): DailyPoint[] => vals.map((gross, i) => ({ date: day(i), gross, orders: gross > 0 ? 3 : 0 }));

test("tahmin: yeterli veri yoksa null (uydurma yok)", () => {
  assert.equal(forecastGross(series([1000, 2000, 3000])), null, "3 gün yetersiz");
  // 20 gün ama yalnız 3 gün satış → seyrek veri, tahmin yok
  assert.equal(forecastGross(series([...Array(17).fill(0), 5000, 6000, 7000])), null);
});

test("tahmin: sabit seride beklenti ortalamaya, aralık std'ye göre", () => {
  const f = forecastGross(series(Array(28).fill(100000)), 7);
  assert.ok(f);
  assert.equal(f.horizonDays, 7);
  assert.equal(f.basisDays, 28);
  assert.equal(f.dailyMean, 100000);
  assert.equal(f.dailyStd, 0);
  assert.equal(f.periodEstimate, 700000);
  assert.equal(f.low, 700000);
  assert.equal(f.high, 700000);
  assert.equal(f.trend, "duz");
});

test("tahmin: dönem tahmini günlük ortalama × ufuk; aralık alt≤üst ve ≥0", () => {
  const f = forecastGross(series([50000, 100000, 75000, 0, 90000, 60000, 80000, 0, 70000, 120000, 55000, 85000, 65000, 95000]), 7);
  assert.ok(f);
  assert.equal(f.dailyMean, Math.round((50000 + 100000 + 75000 + 0 + 90000 + 60000 + 80000 + 0 + 70000 + 120000 + 55000 + 85000 + 65000 + 95000) / 14));
  assert.equal(f.periodEstimate, f.dailyMean * 7);
  assert.ok(f.low >= 0 && f.low <= f.periodEstimate && f.periodEstimate <= f.high);
});

test("tahmin: artan seri 'artiyor', azalan seri 'azaliyor'", () => {
  const up = forecastGross(series(Array.from({ length: 28 }, (_, i) => 10000 + i * 1000)));
  const down = forecastGross(series(Array.from({ length: 28 }, (_, i) => 50000 - i * 1000)));
  assert.equal(up?.trend, "artiyor");
  assert.equal(down?.trend, "azaliyor");
});
