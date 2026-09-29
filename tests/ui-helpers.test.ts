// tests/ui-helpers.test.ts — kategori tonu, hızlı nakit tuşları (sunum yardımcıları)
import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryTone, NEUTRAL_TONE } from "../lib/ui/categoryTone";
import { quickCash } from "../lib/ui/quickCash";

test("categoryTone: aynı id aynı ton, null nötr, dağılım geniş", () => {
  assert.deepEqual(categoryTone("abc"), categoryTone("abc"));
  assert.deepEqual(categoryTone(null), NEUTRAL_TONE);
  const seen = new Set(Array.from({ length: 50 }, (_, i) => categoryTone(`kat-${i}`).dot));
  assert.ok(seen.size >= 6, `yalnız ${seen.size} ton`);
});

test("quickCash: tutarın üstündeki yuvarlak banknotlar, en fazla 3, artan, tam tutar hariç", () => {
  assert.deepEqual(quickCash(53000), [55000, 60000, 100000]);
  assert.deepEqual(quickCash(2000), [5000, 10000, 20000]);
  assert.deepEqual(quickCash(10000), [20000, 50000, 100000]);
  assert.deepEqual(quickCash(4550), [5000, 10000, 20000]);
  assert.deepEqual(quickCash(0), []);
  for (const t of [1, 999, 12345, 250000, 987654]) {
    const r = quickCash(t);
    assert.ok(r.length <= 3 && r.every((v, i) => v > t && (i === 0 || v > r[i - 1])), `${t} → ${r}`);
  }
});
