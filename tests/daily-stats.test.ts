// tests/daily-stats.test.ts — M9c saf hesap: ajans API'sinin günlük özeti ve aralık doğrulaması.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiRange, dailyStats, type DailyRow } from "@/lib/core/report";

const at = (iso: string) => new Date(iso);
const row = (p: Partial<DailyRow>): DailyRow => ({ status: "kapandi", channel: "kasa", total: 10000, tabId: null, at: at("2026-09-28T12:00:00+03:00"), ...p });

test("bölünmüş adisyon tek sipariş, tutarlar toplanır; kanal kırılımı orderCount'a eşit", () => {
  const d = dailyStats([
    row({ channel: "masa", tabId: "t1", total: 6000 }),
    row({ channel: "masa", tabId: "t1", total: 4000 }),
    row({ channel: "paket", tabId: "t2", total: 5000 }),
    row({ channel: "kasa", total: 2500 }),
  ]);
  assert.deepEqual(d, [{ day: "2026-09-28", orderCount: 3, cancelledCount: 0, grossRevenue: 175, channels: { masa: 1, paket: 1, kasa: 1 } }]);
});

test("iade ciroyu düşer, iptal sayılır, sipariş sayısına girmez", () => {
  const [d] = dailyStats([row({ total: 10000 }), row({ status: "iade", total: 2500 })]);
  assert.equal(d.orderCount, 1);
  assert.equal(d.cancelledCount, 1);
  assert.equal(d.grossRevenue, 75);
});

test("platform satışı ve iadesi hariç; yalnız platform olan gün hiç çıkmaz", () => {
  assert.deepEqual(dailyStats([row({ channel: "platform", tabId: "p1" }), row({ channel: "platform", status: "iade" })]), []);
});

test("İstanbul gün sınırı: 23:30 +03 aynı gün, 00:10 +03 ertesi gün; sıralı", () => {
  const d = dailyStats([row({ at: at("2026-09-28T21:10:00Z") }), row({ at: at("2026-09-28T20:30:00Z") })]);
  assert.deepEqual(d.map((x) => x.day), ["2026-09-28", "2026-09-29"]);
});

test("kuruş → TL", () => {
  assert.equal(dailyStats([row({ total: 1234567 })])[0].grossRevenue, 12345.67);
});

test("apiRange: geçerli, ters, 92 gün sınırı, bozuk", () => {
  assert.deepEqual(apiRange("2026-09-01", "2026-09-28"), { bas: "2026-09-01", bit: "2026-09-28" });
  assert.equal(apiRange("2026-09-28", "2026-09-01"), null);
  assert.deepEqual(apiRange("2026-07-01", "2026-09-30"), { bas: "2026-07-01", bit: "2026-09-30" }); // 92 gün
  assert.equal(apiRange("2026-06-30", "2026-09-30"), null); // 93 gün
  assert.equal(apiRange("2026-13-01", "2026-09-30"), null);
  assert.equal(apiRange(null, "2026-09-30"), null);
});
