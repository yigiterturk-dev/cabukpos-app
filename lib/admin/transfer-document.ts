import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type Tx } from "@/db";
import { canUseStore, type AccessActor } from "@/lib/core/access";
import { stockUnitOf } from "@/lib/core/stock";
import type { TransferDocument } from "@/lib/core/transfer-document";

/** withTenant içinde; yalnız kaynak/hedef şube veya merkez görebilir. */
export async function transferDocument(tx: Tx, actor: AccessActor, id: string): Promise<TransferDocument | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const T = schema.stockTransfers, L = schema.stockTransferLines, P = schema.products;
  const F = alias(schema.stores, "transfer_source"), D = alias(schema.stores, "transfer_target");
  const [header] = await tx.select({ id: T.id, createdAt: T.createdAt, fromStoreId: T.fromStoreId, fromName: F.name, toStoreId: T.toStoreId, toName: D.name, note: T.note })
    .from(T).innerJoin(F, eq(F.id, T.fromStoreId)).innerJoin(D, eq(D.id, T.toStoreId)).where(eq(T.id, id));
  if (!header || !(canUseStore(actor, header.fromStoreId) || canUseStore(actor, header.toStoreId))) return null;
  const lines = await tx.select({ productId: P.id, name: P.name, qtyMilli: L.qtyMilli, kind: P.kind, unit: P.unit, sellable: P.sellable })
    .from(L).innerJoin(P, eq(P.id, L.productId)).where(eq(L.transferId, id)).orderBy(P.name, P.id);
  return { ...header, lines: lines.map((line) => ({ productId: line.productId, name: line.name, qtyMilli: line.qtyMilli, unit: stockUnitOf(line) })) };
}
