// tests/billing.test.ts — abonelik durumu (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingInfo, extendFrom, reminderDue, bannerText, planBreakdown } from "@/lib/core/billing";

const D = (s: string) => new Date(s);
const now = D("2026-09-29T12:00:00Z");

test("durum: deneme, uyarı, aktif, ek süre, kilit", () => {
  let i = billingInfo({ trialEndsAt: D("2026-10-13T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.state, i.daysLeft, i.warn, i.locked], ["deneme", 14, false, false]);
  i = billingInfo({ trialEndsAt: D("2026-10-03T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.daysLeft, i.warn], [4, true]);
  assert.equal(bannerText(i), "Deneme süren 4 gün sonra bitiyor.");
  i = billingInfo({ trialEndsAt: D("2026-09-01T00:00:00Z"), paidUntil: D("2026-12-01T00:00:00Z") }, now);
  assert.deepEqual([i.state, i.warn], ["aktif", false]);
  i = billingInfo({ trialEndsAt: D("2026-09-27T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.state, i.daysLeft, i.warn, i.locked], ["ek_sure", 5, true, false]);
  i = billingInfo({ trialEndsAt: D("2026-09-20T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.state, i.locked], ["kilitli", true]);
  assert.match(bannerText(i), /salt okunur/);
});

test("uzatma: kalan süre korunur, bitmişse bugünden", () => {
  assert.equal(extendFrom({ trialEndsAt: D("2026-10-05T00:00:00Z"), paidUntil: null }, "aylik", now).toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(extendFrom({ trialEndsAt: D("2026-09-01T00:00:00Z"), paidUntil: D("2026-09-25T00:00:00Z") }, "yillik", now).toISOString(), "2027-09-29T12:00:00.000Z");
});

test("hatırlatma: 1-7 gün kala, aynı bitişe bir kez", () => {
  const t = { trialEndsAt: D("2026-10-03T12:00:00Z"), paidUntil: null, remindedEnd: null };
  assert.equal(reminderDue(t, now), true);
  assert.equal(reminderDue({ ...t, remindedEnd: t.trialEndsAt }, now), false);
  assert.equal(reminderDue({ ...t, trialEndsAt: D("2026-10-20T00:00:00Z") }, now), false);
  assert.equal(reminderDue({ ...t, trialEndsAt: D("2026-09-28T00:00:00Z") }, now), false);
});

test("katmanlı plan: taban 1 şube + 1 terminal dahil, fazlası birim başına", () => {
  const p = { base: 50_000, store: 10_000, device: 5_000 };
  assert.deepEqual(planBreakdown(p, { stores: 1, devices: 1 }), { base: 50_000, extraStores: 0, extraDevices: 0, total: 50_000 });
  assert.deepEqual(planBreakdown(p, { stores: 3, devices: 4 }), { base: 50_000, extraStores: 20_000, extraDevices: 15_000, total: 85_000 });
});
test("katmanlı plan: birim fiyat tanımsızsa o bileşen ek ücretsiz", () => {
  const p = { base: 50_000, store: null, device: 5_000 };
  assert.equal(planBreakdown(p, { stores: 9, devices: 4 }).total, 65_000);
  assert.equal(planBreakdown({ base: 50_000, store: null, device: null }, { stores: 9, devices: 9 }).total, 50_000);
});
