import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { canUseStore, type AccessActor } from "@/lib/core/access";
import { parseQty, stockUnitOf } from "@/lib/core/stock";
import { stockLevels } from "./stock";

/** Henüz oturum yokken şube satırı kilitlenerek çift açılış önlenir. */
export async function openStockCount(tx: Tx, tenantId: string, actor: AccessActor & { id: string }, storeId: string) {
  if (!canUseStore(actor, storeId)) return { error: "Şube bulunamadı." };
  const [store] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.id, storeId)).for("update");
  if (!store) return { error: "Şube bulunamadı." };
  const [open] = await tx.select({ id: schema.stockCounts.id }).from(schema.stockCounts)
    .where(and(eq(schema.stockCounts.storeId, storeId), eq(schema.stockCounts.status, "acik"))).limit(1);
  if (open) return { error: "Açık bir sayım oturumu zaten var; mevcut oturumu tamamlayın." };
  const rows = await stockLevels(tx, storeId);
  if (!rows.length) return { error: "Sayım başlatmak için stok takibi açık en az bir ürün gerekir." };
  const [count] = await tx.insert(schema.stockCounts).values({ tenantId, storeId, openedBy: `user:${actor.id}` }).returning({ id: schema.stockCounts.id });
  await tx.insert(schema.stockCountLines).values(rows.map((r) => ({ tenantId, countId: count.id, productId: r.id, expectedMilli: r.level })));
  return { id: count.id, lines: rows.length };
}

/** Satır yazımı, kapanış ve iptal aynı oturum kilidini kullanır. */
export async function lockOpenStockCount(tx: Tx, countId: string, actor: AccessActor) {
  const [count] = await tx.select({ status: schema.stockCounts.status, storeId: schema.stockCounts.storeId })
    .from(schema.stockCounts).where(eq(schema.stockCounts.id, countId)).for("update");
  return count?.status === "acik" && canUseStore(actor, count.storeId) ? count : null;
}

export async function saveCountedStockLine(tx: Tx, actor: AccessActor, countId: string, lineId: string, raw: string) {
  if (!await lockOpenStockCount(tx, countId, actor)) return { error: "Oturum kapalı.", field: "qty" };
  const match = and(eq(schema.stockCountLines.id, lineId), eq(schema.stockCountLines.countId, countId));
  const [line] = await tx.select({ kind: schema.products.kind, unit: schema.products.unit, sellable: schema.products.sellable })
    .from(schema.stockCountLines).innerJoin(schema.products, eq(schema.products.id, schema.stockCountLines.productId)).where(match);
  if (!line) return { error: "Satır bulunamadı.", field: "qty" };
  const unit = stockUnitOf(line);
  const qty = parseQty(raw, unit, true);
  if (qty === null) return { error: unit === "adet" ? "Miktar tam sayı olmalı." : `Miktar ${unit} (ör. 2,5).`, field: "qty" };
  await tx.update(schema.stockCountLines).set({ countedMilli: qty }).where(match);
  return null;
}
