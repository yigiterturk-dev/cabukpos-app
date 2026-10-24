// tests/store.test.ts — şube/depo türü kuralları.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceProblem, isDepot, kindChangeProblem, storeKindProblem } from "@/lib/core/store";

test("depo: yalnız 'depo' türü depodur", () => {
  assert.equal(isDepot("depo"), true);
  assert.equal(isDepot("sube"), false);
  assert.equal(isDepot(null), false);
});

test("depo: tür doğrulaması", () => {
  assert.equal(storeKindProblem("sube"), null);
  assert.equal(storeKindProblem("depo"), null);
  assert.equal(storeKindProblem("merkez"), "Şube türü geçersiz.");
});

test("depo: kasa cihazı bağlanamaz", () => {
  assert.equal(deviceProblem("depo"), "Merkez depoya kasa cihazı bağlanamaz.");
  assert.equal(deviceProblem("sube"), null);
});

test("depo: geçmişi/cihazı/müdürü olan şube depoya çevrilemez", () => {
  assert.equal(kindChangeProblem("sube", "depo", true), "Satış geçmişi, bağlı cihazı ya da şube müdürü olan şube depoya çevrilemez.");
  assert.equal(kindChangeProblem("sube", "depo", false), null);
  assert.equal(kindChangeProblem("depo", "sube", true), null);
  assert.equal(kindChangeProblem("sube", "sube", true), null);
});
