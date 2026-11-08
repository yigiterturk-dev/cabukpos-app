// tests/payment-month.test.ts — dış ödeme ay aralığı (Istanbul sınırları, artık yıl).
import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentMonth } from "@/lib/integrations/payments";

const days = (r: { from: Date; to: Date }) => (r.to.getTime() - r.from.getTime()) / 86_400_000;

test("paymentMonth: geçersiz/boş değer bu aya düşer", () => {
  assert.match(paymentMonth().label, /^\d{4}-\d{2}$/);
  assert.match(paymentMonth(null).label, /^\d{4}-\d{2}$/);
  assert.match(paymentMonth("2026-13").label, /^\d{4}-\d{2}$/);
  assert.notEqual(paymentMonth("2026-13").label, "2026-13");
});

test("paymentMonth: ay sınırları ve artık yıl", () => {
  const feb2028 = paymentMonth("2028-02");
  assert.equal(feb2028.label, "2028-02");
  assert.equal(feb2028.from.getTime(), Date.parse("2028-02-01T00:00:00+03:00"));
  assert.equal(days(feb2028), 29);
  assert.equal(days(paymentMonth("2027-02")), 28);
  assert.equal(days(paymentMonth("2026-01")), 31);
  assert.equal(days(paymentMonth("2026-04")), 30);
});
