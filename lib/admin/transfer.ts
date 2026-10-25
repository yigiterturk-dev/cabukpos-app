import { writeStock, restoreShipmentLots } from "@/lib/admin/stock-lots";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { canUseStore, type AccessActor } from "@/lib/core/access";
import { formatQty, parseQty, stockUnitOf } from "@/lib/core/stock";
import { MAX_TRANSFER_LINES, transferProblem } from "@/lib/core/transfer";
import { stockLevels } from "./stock";

export type TransferError = { error: string; field?: string; line?: number; column?: "productId" | "qty" };
export const SHIPMENT_LABELS: Record<string, string> = { gonderildi: "Gönderildi", yolda: "Yolda", teslim: "Teslim alındı", iptal: "İptal" };
type TransferInput = { fromStoreId: string; toStoreId: string; note: string | null; lines: { productId: string; qty: string }[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tüm kalemler doğrulanmadan hareket yazılmaz; withTenant içinde çağrılır. */
export async function recordTransfer(tx: Tx, tenantId: string, actor: AccessActor & { id: string }, input: TransferInput): Promise<{ id: string } | TransferError> {
  const { fromStoreId, toStoreId, lines } = input;
  if (!UUID.test(fromStoreId) || !UUID.test(toStoreId)) return { error: "Kaynak ve hedef şube seçin." };
  if (fromStoreId === toStoreId) return { error: "Kaynak ve hedef şube aynı olamaz." };
  if (!canUseStore(actor, fromStoreId)) return { error: "Yalnız kendi şubenizden transfer başlatabilirsiniz." };
  if (!lines.length || lines.length > MAX_TRANSFER_LINES) return { error: `Transfer 1–${MAX_TRANSFER_LINES} ürün içermeli.` };
  const ids = lines.map((line) => line.productId);
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    if (!UUID.test(ids[i])) return { error: `${i + 1}. kalemde ürün seçin.`, field: "lines", line: i, column: "productId" };
    if (seen.has(ids[i])) return { error: "Aynı ürünü bir kez ekleyin; miktarını tek kalemde belirtin.", field: "lines", line: i, column: "productId" };
    seen.add(ids[i]);
  }
  const stores = await tx.select({ id: schema.stores.id }).from(schema.stores).where(inArray(schema.stores.id, [fromStoreId, toStoreId]));
  if (stores.length !== 2) return { error: "Şube bulunamadı; sayfayı yenileyip yeniden deneyin." };
  const P = schema.products;
  // Ters ürün sıralı eşzamanlı transferler de kilitleri aynı sırayla alır.
  const products = await tx.select({ id: P.id, name: P.name, kind: P.kind, unit: P.unit, sellable: P.sellable, trackStock: P.trackStock })
    .from(P).where(inArray(P.id, ids)).orderBy(P.id).for("update");
  const byId = new Map(products.map((p) => [p.id, p]));
  const levels = new Map((await stockLevels(tx, fromStoreId)).map((p) => [p.id, p.level]));
  const parsed: { productId: string; qtyMilli: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], product = byId.get(line.productId);
    if (!product?.trackStock) return { error: `${i + 1}. kalemde stok takipli bir ürün seçin.`, field: "lines", line: i, column: "productId" };
    const unit = stockUnitOf(product);
    const qtyMilli = parseQty(line.qty, unit);
    if (qtyMilli === null) return { error: `${product.name}: miktar 0'dan büyük ${unit === "adet" ? "tam sayı" : unit} olmalı.`, field: "lines", line: i, column: "qty" };
    const level = levels.get(product.id) ?? 0;
    if (transferProblem({ fromStoreId, toStoreId, qtyMilli, level })) return { error: `${product.name}: kaynakta yalnız ${formatQty(level, unit)}${unit === "adet" ? " adet" : ""} var.`, field: "lines", line: i, column: "qty" };
    parsed.push({ productId: product.id, qtyMilli });
  }
  const actorName = `user:${actor.id}`;
  const note = input.note?.trim().slice(0, 200) || null;
  const [transfer] = await tx.insert(schema.stockTransfers).values({ tenantId, fromStoreId, toStoreId, note, createdBy: actorName, status: "gonderildi" }).returning({ id: schema.stockTransfers.id });
  await tx.insert(schema.stockTransferLines).values(parsed.map((line) => ({ tenantId, transferId: transfer.id, ...line })));
  await writeStock(tx, parsed.map((line) => (
    { tenantId, storeId: fromStoreId, productId: line.productId, kind: "transfer" as const, qtyMilli: -line.qtyMilli, actor: actorName, note: note ?? "Şubeler arası sevkiyat", transferId: transfer.id }
  )));
  await audit(tx, tenantId, actorName, "stock.transfer", { transferId: transfer.id, fromStoreId, toStoreId, lines: parsed, note });
  return { id: transfer.id };
}

/** Header row lock makes receiving/cancelling repeatable without duplicating stock movements. */
export async function changeShipment(tx: Tx, tenantId: string, actor: AccessActor & { id: string }, id: string, next: string): Promise<{ id: string } | TransferError> {
  if (!UUID.test(id) || !["yolda", "teslim", "iptal"].includes(next)) return { error: "Geçersiz sevkiyat işlemi." };
  const T = schema.stockTransfers, L = schema.stockTransferLines, P = schema.products;
  const [transfer] = await tx.select().from(T).where(and(eq(T.tenantId, tenantId), eq(T.id, id))).for("update");
  if (!transfer || !canUseStore(actor, next === "teslim" ? transfer.toStoreId : transfer.fromStoreId)) return { error: "Bu sevkiyatta işlem yetkiniz yok." };
  if (transfer.status === next) return { id };
  if (transfer.status === "teslim" || transfer.status === "iptal") return { error: "Kapanmış sevkiyat değiştirilemez. Gerekirse yeni ters sevkiyat oluşturun." };
  const lines = await tx.select().from(L).where(and(eq(L.tenantId, tenantId), eq(L.transferId, id))).orderBy(L.productId);
  if (!lines.length) return { error: "Sevkiyat kalemleri bulunamadı." };
  await tx.select({ id: P.id }).from(P).where(and(eq(P.tenantId, tenantId), inArray(P.id, lines.map(l => l.productId)))).orderBy(P.id).for("update");
  if (next !== "yolda") await writeStock(tx, lines.map(l => ({ tenantId, storeId: next === "teslim" ? transfer.toStoreId : transfer.fromStoreId, productId: l.productId, kind: "transfer" as const, qtyMilli: l.qtyMilli, actor: `user:${actor.id}`, note: next === "teslim" ? "Sevkiyat teslim alındı" : "Sevkiyat iptali · kaynak stoğa dönüş", transferId: id })));
  if (next !== "yolda") await restoreShipmentLots(tx,tenantId,id,next === "teslim" ? transfer.toStoreId : transfer.fromStoreId,`user:${actor.id}`);
  await tx.update(T).set({ status: next, updatedAt: new Date(), ...(next === "teslim" ? { receivedAt: new Date(), receivedBy: `user:${actor.id}` } : {}) }).where(and(eq(T.id, id), eq(T.tenantId, tenantId)));
  await audit(tx, tenantId, `user:${actor.id}`, "stock.shipment.status", { id, fromStoreId: transfer.fromStoreId, toStoreId: transfer.toStoreId, before: transfer.status, status: next });
  return { id };
}
