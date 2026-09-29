"use server";
// Reçete (ürün / seçenek / ara ürün) ve üretim. Kural lib/core/recipe.ts; her yazma requireWriter + withTenant (RLS) + denetim kaydı.
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { batchCost, productionMoves, recipeError } from "@/lib/core/recipe";
import { stockUnitOf } from "@/lib/core/stock";
import { firstStoreId } from "./stock";
import { parseRecipeQty } from "./recipe";

export type RecipeState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;
const R = schema.recipeItems, P = schema.products;

export async function saveRecipe(target: { productId?: string; optionId?: string }, _: RecipeState, form: FormData): Promise<RecipeState> {
  const a = await requireWriter();
  const tid = target.productId ?? target.optionId ?? "";
  if (!UUID.test(tid)) return { error: "Reçete sahibi bulunamadı." };
  const ings = form.getAll("ing").map(String), qtys = form.getAll("qty").map(String);
  const rows = ings.map((id, i) => ({ id, qty: qtys[i] ?? "" })).filter((r) => r.id || r.qty.trim());
  if (rows.some((r) => !UUID.test(r.id))) return { error: "Her satırda malzeme seçin.", field: "items" };
  if (new Set(rows.map((r) => r.id)).size !== rows.length) return { error: "Aynı malzeme iki kez var; miktarı tek satırda toplayın.", field: "items" };
  const err = await withTenant(a.tenantId, async (tx): Promise<RecipeState | null> => {
    let owner: { id: string | null; sellable: boolean; yieldMilli: number | null; name: string };
    if (target.productId) {
      const [p] = await tx.select({ id: P.id, name: P.name, sellable: P.sellable, yieldMilli: P.yieldMilli }).from(P).where(eq(P.id, target.productId));
      if (!p) return { error: "Ürün bulunamadı." };
      owner = p;
    } else {
      const [o] = await tx.select({ name: schema.options.name }).from(schema.options).where(eq(schema.options.id, target.optionId!));
      if (!o) return { error: "Seçenek bulunamadı." };
      owner = { id: null, sellable: true, yieldMilli: null, name: o.name };
    }
    const ids = rows.map((r) => r.id);
    const found = ids.length ? await tx.select({ id: P.id, name: P.name, sellable: P.sellable, trackStock: P.trackStock, kind: P.kind, unit: P.unit }).from(P).where(inArray(P.id, ids)) : [];
    if (found.length !== ids.length) return { error: "Malzeme bulunamadı.", field: "items" };
    const withRecipe = new Set(ids.length ? (await tx.selectDistinct({ id: R.productId }).from(R).where(inArray(R.productId, ids))).map((r) => r.id) : []);
    const usedBy = target.productId
      ? await tx.select({ sellable: P.sellable }).from(R).leftJoin(P, eq(P.id, R.productId)).where(eq(R.ingredientId, target.productId)).then((u) => u.map((x) => ({ sellable: x.sellable ?? true })))
      : [];
    const byId = new Map(found.map((f) => [f.id, f]));
    const e = recipeError(owner, ids.map((id) => ({ ...byId.get(id)!, hasRecipe: withRecipe.has(id) })), usedBy);
    if (e) return { error: e, field: "items" };
    const items: { ingredientId: string; qtyMilli: number }[] = [];
    for (const r of rows) {
      const ing = byId.get(r.id)!;
      const unit = stockUnitOf(ing);
      const q = parseRecipeQty(r.qty, unit);
      if (q === null) return { error: `${ing.name}: miktar ${unit === "kg" ? "gram" : unit === "lt" ? "ml" : "adet"} olarak girin.`, field: "items" };
      items.push({ ingredientId: r.id, qtyMilli: q });
    }
    await tx.delete(R).where(target.productId ? eq(R.productId, target.productId) : eq(R.optionId, target.optionId!));
    if (items.length) await tx.insert(R).values(items.map((i) => ({ tenantId: a.tenantId, productId: target.productId ?? null, optionId: target.optionId ?? null, ...i })));
    await audit(tx, a.tenantId, `user:${a.id}`, "recipe.save", { ...target, name: owner.name, items });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/receteler");
  return { savedAt: Date.now() };
}

/** Üretim: N parti ara ürün → ara ürün +, hammaddeler −; hammadde maliyetleri tamsa ara ürün maliyeti güncellenir. */
export async function produce(_: RecipeState, form: FormData): Promise<RecipeState> {
  const a = await requireWriter();
  const productId = String(form.get("productId") ?? "");
  if (!UUID.test(productId)) return { error: "Ara ürün seçin.", field: "productId" };
  const t = String(form.get("batches") ?? "").trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t) || Number(t) <= 0) return { error: "Parti sayısı geçersiz (ör. 2 ya da 0,5).", field: "batches" };
  const batchesMilli = Math.round(Number(t) * 1000);
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  const err = await withTenant(a.tenantId, async (tx): Promise<RecipeState | null> => {
    const [p] = await tx.select({ id: P.id, name: P.name, sellable: P.sellable, yieldMilli: P.yieldMilli }).from(P).where(eq(P.id, productId));
    if (!p || p.sellable || !p.yieldMilli) return { error: "Ara ürün bulunamadı (parti miktarı olan satılmaz ürün).", field: "productId" };
    const items = await tx.select({ ingredientId: R.ingredientId, qtyMilli: R.qtyMilli }).from(R).where(eq(R.productId, productId));
    if (!items.length) return { error: "Ara ürünün reçetesi yok.", field: "productId" };
    const storeId = await firstStoreId(tx);
    if (!storeId) return { error: "Şube yok." };
    const [prod] = await tx.insert(schema.productions).values({ tenantId: a.tenantId, storeId, productId, batchesMilli, note, createdBy: a.id }).returning({ id: schema.productions.id });
    const actor = `user:${a.id}`;
    await tx.insert(schema.stockMovements).values(productionMoves(productId, batchesMilli, p.yieldMilli, items).map((m) => ({ tenantId: a.tenantId, storeId, productId: m.productId, kind: "uretim" as const, qtyMilli: m.qtyMilli, productionId: prod.id, actor, note })));
    const costs = new Map((await tx.select({ id: P.id, cost: P.cost }).from(P).where(inArray(P.id, items.map((i) => i.ingredientId)))).map((c) => [c.id, c.cost]));
    const cost = batchCost(items, (id) => costs.get(id), p.yieldMilli);
    if (cost !== null) await tx.update(P).set({ cost, costAt: new Date() }).where(eq(P.id, productId));
    await audit(tx, a.tenantId, actor, "production.create", { productId, name: p.name, batchesMilli, cost });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/uretim");
  revalidatePath("/yonetim/stok");
  return { savedAt: Date.now() };
}
