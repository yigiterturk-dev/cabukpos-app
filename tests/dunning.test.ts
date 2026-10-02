// tests/dunning.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY, GRACE_DAYS, billingInfo } from "@/lib/core/billing";
import { dunningIcerik, dunningStage } from "@/lib/billing/dunning";

const bitis = new Date(Date.UTC(2026, 9, 1)); // 2026-10-01
const asama = (gun: number) => {
  const now = new Date(bitis.getTime() + gun * DAY);
  return dunningStage(billingInfo({ trialEndsAt: new Date(0), paidUntil: bitis }, now), now);
};

test("bitiş öncesi dunning yok (hatırlatma ayrı akış)", () => {
  assert.equal(asama(-1), null);
  assert.equal(asama(0), null);
});

test("ek sürede 1/3/5. gün aşamaları, aradaki günler sessiz", () => {
  assert.equal(asama(1), "gecikme1");
  assert.equal(asama(2), null);
  assert.equal(asama(3), "gecikme3");
  assert.equal(asama(4), null);
  assert.equal(asama(5), "gecikme5");
  assert.equal(asama(6), null);
});

test("kilit günü ve haftalık hatırlatma", () => {
  assert.equal(asama(GRACE_DAYS), "kilit1");
  assert.equal(asama(GRACE_DAYS + 1), null);
  assert.equal(asama(GRACE_DAYS + 7), "kilitHaftalik");
  assert.equal(asama(GRACE_DAYS + 8), null);
  assert.equal(asama(GRACE_DAYS + 14), "kilitHaftalik");
});

test("her aşamanın içeriği dolu", () => {
  for (const stage of ["gecikme1", "gecikme3", "gecikme5", "kilit1", "kilitHaftalik"] as const) {
    const icerik = dunningIcerik(stage);
    assert.ok(icerik.baslik.length > 5 && icerik.kisa.length > 10 && icerik.kalin.length > 10, stage);
  }
});
