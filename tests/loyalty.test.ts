// tests/loyalty.test.ts — #33: sadakat puanı + kupon hesapları (saf fonksiyonlar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { couponCheck, newGiftCardCode, normalizeCouponCode, pointsEarned, pointsForKurus, pointsValue, type CouponLike } from "@/lib/loyalty";

const base: CouponLike = { kind: "yuzde", value: 10, minSubtotal: 0, maxDiscount: null, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: 1, usedCount: 0 };
const mid = new Date("2026-10-02T12:00:00Z");

test("kupon: tarih, limit, alt sınır ve müşteri limiti", () => {
  assert.deepEqual(couponCheck(base, 50000, mid), { ok: true, discount: 5000 });
  assert.equal(couponCheck({ ...base, startsAt: new Date("2026-11-01") }, 50000, mid).ok, false);
  assert.equal(couponCheck({ ...base, endsAt: new Date("2026-09-01") }, 50000, mid).ok, false);
  assert.equal(couponCheck({ ...base, usageLimit: 5, usedCount: 5 }, 50000, mid).ok, false);
  assert.equal(couponCheck({ ...base, perCustomerLimit: 1 }, 50000, mid, 1).ok, false);
  assert.equal(couponCheck({ ...base, perCustomerLimit: 2 }, 50000, mid, 1).ok, true);
  const min = couponCheck({ ...base, minSubtotal: 60000 }, 50000, mid);
  assert.equal(min.ok, false);
  if (!min.ok) assert.match(min.reason, /600,00/);
});

test("kupon: yüzde aşağı yuvarlar, üst sınıra takılır; tutar sepeti aşmaz; teslimat 0", () => {
  assert.deepEqual(couponCheck({ ...base, value: 15 }, 9999, mid), { ok: true, discount: 1499 });
  assert.deepEqual(couponCheck({ ...base, value: 50, maxDiscount: 20000 }, 99999, mid), { ok: true, discount: 20000 });
  assert.deepEqual(couponCheck({ ...base, kind: "tutar", value: 7500 }, 5000, mid), { ok: true, discount: 5000 });
  assert.deepEqual(couponCheck({ ...base, kind: "tutar", value: 7500 }, 50000, mid), { ok: true, discount: 7500 });
  assert.deepEqual(couponCheck({ ...base, kind: "teslimat", value: 0 }, 50000, mid), { ok: true, discount: 0 });
});

test("puan: kazanç, para değeri ve harcama çevrimi", () => {
  assert.equal(pointsEarned(123456, 10000), 12); // 1234,56 ₺ / 100 ₺
  assert.equal(pointsEarned(9999, 10000), 0);
  assert.equal(pointsEarned(50000, 0), 0); // kapalı
  assert.equal(pointsValue(12, 100), 1200);
  assert.equal(pointsForKurus(1500, 100), 15);
  assert.equal(pointsForKurus(99, 100), 0);
  assert.equal(pointsForKurus(1500, 0), 0);
});

test("kod: hediye kartı biçimi ve kupon kodu normalize", () => {
  for (let i = 0; i < 20; i++) assert.match(newGiftCardCode(), /^HK-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(normalizeCouponCode(" yaz 20 "), "YAZ20");
  assert.equal(normalizeCouponCode("AB"), null);
  assert.equal(normalizeCouponCode("KÖPEK"), null); // Türkçe harf reddedilir
  assert.equal(normalizeCouponCode("A".repeat(25)), null);
  assert.equal(normalizeCouponCode("YAZ-20"), "YAZ20");
});
