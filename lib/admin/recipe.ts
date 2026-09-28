// lib/admin/recipe.ts — Reçete ekranı yardımcıları (sunucu, eylem değil).
import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import type { StockUnit } from "@/lib/core/stock";

/** Reçete miktarı: kg/lt malzemede gram/ml tam sayı, adet malzemede en çok 3 ondalık → qtyMilli. */
export function parseRecipeQty(s: string, unit: StockUnit): number | null {
  const t = s.trim().replace(",", ".");
  if (unit !== "adet") return /^\d{1,6}$/.test(t) && Number(t) > 0 ? Number(t) : null;
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t)) return null;
  const q = Math.round(Number(t) * 1000);
  return q > 0 ? q : null;
}

/** Son üretimler (sayfa için). */
export async function recentProductions(tenantId: string) {
  const Pr = schema.productions, P = schema.products;
  return withTenant(tenantId, (tx) => tx.select({ id: Pr.id, at: Pr.createdAt, batchesMilli: Pr.batchesMilli, note: Pr.note, name: P.name, yieldMilli: P.yieldMilli, unit: P.unit })
    .from(Pr).innerJoin(P, eq(P.id, Pr.productId)).orderBy(desc(Pr.createdAt)).limit(30));
}
