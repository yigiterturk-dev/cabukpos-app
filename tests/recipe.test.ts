// tests/recipe.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { consumption, lineCost, batchCost, productionMoves, isCritical, type RecipeItem } from "@/lib/core/recipe";
import { formatQty, parseQty } from "@/lib/core/stock";

// E2E senaryosu: un 20 TL/kg, kıyma 400 TL/kg; Harç (1 kg parti) = kıyma 600 g + un 400 g; Lahmacun = harç 100 g + un 150 g; Ekstra kıyma = kıyma 30 g.
const harc: RecipeItem[] = [{ productId: "harc", ingredientId: "kiyma", qtyMilli: 600 }, { productId: "harc", ingredientId: "un", qtyMilli: 400 }];
const byProduct = new Map([["lahmacun", [{ productId: "lahmacun", ingredientId: "harc", qtyMilli: 100 }, { productId: "lahmacun", ingredientId: "un", qtyMilli: 150 }]], ["harc", harc]]);
const byOption = new Map([["ekstra", [{ optionId: "ekstra", ingredientId: "kiyma", qtyMilli: 30 }]], ["unlu", [{ optionId: "unlu", ingredientId: "un", qtyMilli: 50 }]]]);
const costs: Record<string, number | null> = { un: 2000, kiyma: 40000, harc: 24800, ayran: 900, pide: null };
const costOf = (id: string) => costs[id];

test("düşüm: reçete × miktar, seçenek eklenir, aynı hammadde birleşir", () => {
  assert.deepEqual(Object.fromEntries(consumption({ productId: "lahmacun", qtyMilli: 3000 }, byProduct, byOption)), { harc: 300, un: 450 });
  assert.deepEqual(Object.fromEntries(consumption({ productId: "lahmacun", qtyMilli: 1000, options: [{ id: "ekstra" }, { id: "unlu" }] }, byProduct, byOption)), { harc: 100, un: 200, kiyma: 30 });
});

test("düşüm: tartılı satır oranlı ve yuvarlanır; iade eksi", () => {
  const w = new Map([["kofte", [{ productId: "kofte", ingredientId: "kiyma", qtyMilli: 333 }]]]);
  assert.equal(consumption({ productId: "kofte", qtyMilli: 1500 }, w, new Map()).get("kiyma"), 500); // 499.5 → 500
  assert.equal(consumption({ productId: "lahmacun", qtyMilli: -2000 }, byProduct, byOption).get("un"), -300);
  assert.equal(consumption({ productId: "ayran", qtyMilli: 1000 }, byProduct, byOption).size, 0);
});

test("maliyet: reçeteli, seçenekli, reçetesiz, eksik → null, iade pozitif", () => {
  assert.equal(lineCost({ productId: "lahmacun", qtyMilli: 1000 }, byProduct, byOption, costOf), 2780);
  assert.equal(lineCost({ productId: "lahmacun", qtyMilli: 1000, options: [{ id: "ekstra" }] }, byProduct, byOption, costOf), 3980);
  assert.equal(lineCost({ productId: "lahmacun", qtyMilli: -2000 }, byProduct, byOption, costOf), 5560);
  assert.equal(lineCost({ productId: "ayran", qtyMilli: 2000 }, byProduct, byOption, costOf), 1800);
  assert.equal(lineCost({ productId: "pide", qtyMilli: 1000 }, byProduct, byOption, costOf), null);
  assert.equal(lineCost({ productId: null, qtyMilli: 1000 }, byProduct, byOption, costOf), null);
  assert.equal(lineCost({ productId: "lahmacun", qtyMilli: 1000 }, byProduct, byOption, (id) => (id === "harc" ? null : costs[id])), null);
});

test("üretim: parti maliyeti ve hareketler", () => {
  assert.equal(batchCost(harc, costOf, 1000), 24800);
  assert.equal(batchCost(harc, costOf, 2000), 12400);
  assert.equal(batchCost(harc, (id) => (id === "un" ? null : costs[id]), 1000), null);
  assert.deepEqual(productionMoves("harc", 2000, 1000, harc), [{ productId: "harc", qtyMilli: 2000 }, { productId: "kiyma", qtyMilli: -1200 }, { productId: "un", qtyMilli: -800 }]);
});

test("kritik stok", () => {
  assert.equal(isCritical(500, 500), true);
  assert.equal(isCritical(501, 500), false);
  assert.equal(isCritical(-1, null), false);
});

test("miktar birimi: lt ve eski tartılı", () => {
  assert.equal(parseQty("1,5", "lt"), 1500);
  assert.equal(parseQty("1,5", "adet"), null);
  assert.equal(formatQty(1500, "lt"), "1,500 lt");
  assert.equal(formatQty(-250, "tartili"), "−0,250 kg");
});

test("reçete kuralı: derinlik 1, kendine yok, stok takipli", async () => {
  const { recipeError } = await import("@/lib/core/recipe");
  const n = (id: string, o: Partial<{ sellable: boolean; trackStock: boolean; hasRecipe: boolean }> = {}) => ({ id, name: id, sellable: false, trackStock: true, hasRecipe: false, ...o });
  assert.equal(recipeError({ id: "lah", sellable: true }, [n("harc", { hasRecipe: true }), n("un")], []), null);
  assert.equal(recipeError({ id: null, sellable: true }, [n("kiyma")], []), null);
  assert.equal(recipeError({ id: "harc", sellable: false, yieldMilli: 1000 }, [n("kiyma"), n("un")], [{ sellable: true }]), null);
  assert.match(recipeError({ id: "harc", sellable: false }, [n("un")], [])!, /parti/);
  assert.match(recipeError({ id: "harc", sellable: false, yieldMilli: 1000 }, [n("sos", { hasRecipe: true })], [])!, /ara ürün olamaz/);
  assert.match(recipeError({ id: "sos", sellable: false, yieldMilli: 1000 }, [n("un")], [{ sellable: false }])!, /iç içe/);
  assert.match(recipeError({ id: "ayran", sellable: true }, [n("sut")], [{ sellable: true }])!, /iç içe/);
  assert.match(recipeError({ id: "lah", sellable: true }, [n("menu", { sellable: true, hasRecipe: true })], [])!, /yalnız ara ürün/);
  assert.match(recipeError({ id: "lah", sellable: true }, [n("lah")], [])!, /kendi/);
  assert.match(recipeError({ id: "lah", sellable: true }, [n("pide", { sellable: true, trackStock: false })], [])!, /stok takipli/);
  assert.equal(recipeError({ id: "ayran", sellable: true }, [], [{ sellable: true }]), null); // reçeteyi boşaltmak serbest
});

test("reçete miktarı: kg/lt gram-ml tam sayı, adet ondalıklı", async () => {
  const { parseRecipeQty } = await import("@/lib/admin/recipe");
  assert.equal(parseRecipeQty("150", "kg"), 150);
  assert.equal(parseRecipeQty("1,5", "lt"), null);
  assert.equal(parseRecipeQty("0,5", "adet"), 500);
  assert.equal(parseRecipeQty("0", "adet"), null);
});
