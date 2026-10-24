// tests/franchise.test.ts — franchise hakediş: ciro payı, ay gününe oranlı sabit bedel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { franchiseCharge, parseFeeKurus, parseRoyaltyBps, proratedMonthlyFee, royaltyCharge } from "@/lib/core/franchise";

test("franchise: ciro payı bps ile kuruşa yuvarlanır", () => {
  assert.equal(royaltyCharge(1_000_000, 500), 50_000);
  assert.equal(royaltyCharge(1_000_000, 550), 55_000);
  assert.equal(royaltyCharge(333, 333), 11);
  assert.equal(royaltyCharge(1_000_000, null), 0);
  assert.equal(royaltyCharge(1_000_000, 0), 0);
  assert.equal(royaltyCharge(0, 500), 0);
});

test("franchise: ciro payı biçimi", () => {
  assert.equal(parseRoyaltyBps(""), null);
  assert.equal(parseRoyaltyBps("5"), 500);
  assert.equal(parseRoyaltyBps("5,5"), 550);
  assert.equal(parseRoyaltyBps("5.5"), 550);
  assert.equal(parseRoyaltyBps("%7"), 700);
  assert.equal(parseRoyaltyBps("0"), 0);
  assert.equal(parseRoyaltyBps("100"), 10000);
  assert.equal(parseRoyaltyBps("100,01"), "invalid");
  assert.equal(parseRoyaltyBps("5,555"), "invalid");
  assert.equal(parseRoyaltyBps("abc"), "invalid");
});

test("franchise: sabit bedel ayın kendi gün sayısıyla oranlanır", () => {
  assert.equal(proratedMonthlyFee(30_000, "2026-01-01", "2026-01-31"), 30_000);
  assert.equal(proratedMonthlyFee(30_000, "2026-02-01", "2026-02-28"), 30_000);
  assert.equal(proratedMonthlyFee(30_000, "2026-02-15", "2026-02-28"), 15_000);
  assert.equal(proratedMonthlyFee(30_000, "2026-01-31", "2026-01-31"), 968);
  assert.equal(proratedMonthlyFee(30_000, "2026-01-31", "2026-02-01"), 2_039);
  assert.equal(proratedMonthlyFee(30_000, "2026-03-01", "2026-02-01"), 0);
  assert.equal(proratedMonthlyFee(null, "2026-01-01", "2026-01-31"), 0);
});

test("franchise: form bedeli ve toplam hakediş", () => {
  assert.equal(parseFeeKurus(""), null);
  assert.equal(parseFeeKurus("0"), 0);
  assert.equal(parseFeeKurus("1.500,50"), 150_050);
  assert.equal(parseFeeKurus("-5"), "invalid");
  assert.equal(parseFeeKurus("1000001"), "invalid");
  assert.deepEqual(franchiseCharge({ royaltyBps: 500, monthlyFee: 30_000 }, 1_000_000, "2026-02-15", "2026-02-28"), { royalty: 50_000, fixed: 15_000, total: 65_000 });
});
