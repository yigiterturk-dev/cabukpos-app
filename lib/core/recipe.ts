// lib/core/recipe.ts — Reçete düşümü ve maliyet. Miktarlar qtyMilli (1000 = 1 adet/kg/lt), para kuruş.
import type { Kurus } from "./money";

/** Kalem 1 birim üst ürün (ya da seçenek) için; ara üründe bir parti (yieldMilli) için. */
export type RecipeItem = { productId?: string | null; optionId?: string | null; ingredientId: string; qtyMilli: number };
export type RecipeLine = { productId: string | null; qtyMilli: number; options?: { id: string }[] };
export type Recipes = Map<string, RecipeItem[]>;
export type CostOf = (productId: string) => Kurus | null | undefined;

/** Satırın hammadde tüketimi (ürün + seçenek reçeteleri, aynı hammadde birleşir). İade satırında (qty < 0) eksi çıkar. */
export function consumption(line: RecipeLine, byProduct: Recipes, byOption: Recipes): Map<string, number> {
  const out = new Map<string, number>();
  const add = (items: RecipeItem[] | undefined) => {
    for (const it of items ?? []) out.set(it.ingredientId, (out.get(it.ingredientId) ?? 0) + it.qtyMilli * line.qtyMilli / 1000);
  };
  if (line.productId) add(byProduct.get(line.productId));
  for (const o of line.options ?? []) add(byOption.get(o.id));
  for (const [k, v] of out) out.set(k, Math.round(v));
  return out;
}

/** Satır maliyeti (her zaman pozitif). Reçeteli → hammaddelerden; reçetesiz → ürün maliyeti; seçenek reçeteleri eklenir. Bir maliyet eksikse null. */
export function lineCost(line: RecipeLine, byProduct: Recipes, byOption: Recipes, costOf: CostOf): Kurus | null {
  const qty = Math.abs(line.qtyMilli);
  let total = 0;
  const items: RecipeItem[] = [];
  const own = line.productId ? byProduct.get(line.productId) : undefined;
  if (own?.length) items.push(...own);
  else {
    const c = line.productId ? costOf(line.productId) : null;
    if (c == null) return null;
    total += c * qty / 1000;
  }
  for (const o of line.options ?? []) items.push(...(byOption.get(o.id) ?? []));
  for (const it of items) {
    const c = costOf(it.ingredientId);
    if (c == null) return null;
    total += c * it.qtyMilli / 1000 * qty / 1000;
  }
  return Math.round(total);
}

/** Ara ürünün 1 birim (adet/kg/lt) maliyeti: parti maliyeti / parti miktarı. Maliyet eksikse null. */
export function batchCost(items: RecipeItem[], costOf: CostOf, yieldMilli: number): Kurus | null {
  if (yieldMilli <= 0 || items.length === 0) return null;
  let total = 0;
  for (const it of items) {
    const c = costOf(it.ingredientId);
    if (c == null) return null;
    total += c * it.qtyMilli / 1000;
  }
  return Math.round(total * 1000 / yieldMilli);
}

/** Üretim: batchesMilli parti (2000 = 2 parti) → ara ürün +, hammaddeler −. */
export function productionMoves(productId: string, batchesMilli: number, yieldMilli: number, items: RecipeItem[]): { productId: string; qtyMilli: number }[] {
  const moves = new Map<string, number>([[productId, Math.round(batchesMilli * yieldMilli / 1000)]]);
  for (const it of items) moves.set(it.ingredientId, (moves.get(it.ingredientId) ?? 0) - Math.round(batchesMilli * it.qtyMilli / 1000));
  return [...moves].map(([productId, qtyMilli]) => ({ productId, qtyMilli }));
}

export const isCritical = (level: number, minStock: number | null | undefined) => minStock != null && level <= minStock;
