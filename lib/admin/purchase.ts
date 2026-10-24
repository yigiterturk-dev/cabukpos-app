// lib/admin/purchase.ts — Alış fişi ve tedarikçi (sunucu, tx içinde; RLS kiracıyı ayırır). Kural lib/core/purchase.ts.
// Alış: kalem başına +alis hareketi (purchase_id), ürün maliyeti = birim fiyat (eski tarihli fiş ezmez).
// İptal: ters alis hareketleri; maliyet geri alınmaz.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { isVatRate } from "@/lib/core/money";
import { purchaseLineTotal, purchaseTotal, shouldUpdateCost, supplierBalance } from "@/lib/core/purchase";

export type PurchaseInput = { storeId: string; supplierId: string | null; docNo: string | null; date: string; note: string | null; lines: { productId: string; qtyMilli: number; unitCost: number }[] };
const P = schema.products, Pu = schema.purchases, PL = schema.purchaseLines;

/** Kaydeder; kiracıda olmayan ürün/tedarikçi → hata metni. */
export async function recordPurchase(tx: Tx, tenantId: string, userId: string | null, input: PurchaseInput): Promise<{ id: string } | { error: string }> {
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  // Maliyet tarihini kilit altında oku: eşzamanlı eski fiş yeni maliyeti ezmesin.
  // Ters sırada ürün içeren fişler de kilitleri aynı sırada alır.
  const prods = await tx.select({ id: P.id, trackStock: P.trackStock, costAt: P.costAt, vatRate: P.vatRate })
    .from(P).where(inArray(P.id, ids)).orderBy(P.id).for("update");
  if (prods.length !== ids.length) return { error: "Ürün bulunamadı." };
  if (prods.some((p) => !p.trackStock)) return { error: "Alışta yalnız stok takipli ürün olur." };
  if (input.supplierId && !(await tx.select({ id: schema.suppliers.id }).from(schema.suppliers).where(eq(schema.suppliers.id, input.supplierId))).length) return { error: "Tedarikçi bulunamadı." };
  const vat = new Map(prods.map((p) => [p.id, isVatRate(p.vatRate) ? p.vatRate : null])); // KDV muhasebesi için satırda dondurulur
  const [pu] = await tx.insert(Pu).values({ tenantId, storeId: input.storeId, supplierId: input.supplierId, docNo: input.docNo, date: input.date, total: purchaseTotal(input.lines), note: input.note, createdBy: userId }).returning({ id: Pu.id });
  await tx.insert(PL).values(input.lines.map((l) => ({ tenantId, purchaseId: pu.id, ...l, vatRate: vat.get(l.productId) ?? null, total: purchaseLineTotal(l) })));
  const at = new Date(`${input.date}T12:00:00+03:00`); // fiş günü; saat bilinmez → öğlen (İstanbul)
  const now = new Date();
  await tx.insert(schema.stockMovements).values(input.lines.map((l) => ({ tenantId, storeId: input.storeId, productId: l.productId, kind: "alis" as const, qtyMilli: l.qtyMilli, at: at > now ? now : at, purchaseId: pu.id, actor: userId ? `user:${userId}` : "system" })));
  // Maliyet gün bazında: fiş günü ≥ son maliyet günü ise ezer (aynı gün → sonra kaydedilen). Aynı üründe birden çok kalem → sonuncusu.
  const start = new Date(`${input.date}T00:00:00+03:00`);
  const costAt = new Map(prods.map((p) => [p.id, p.costAt]));
  for (const l of input.lines) {
    const prev = costAt.get(l.productId);
    if (!shouldUpdateCost(input.date, prev && dayOf(prev))) continue;
    await tx.update(P).set({ cost: l.unitCost, costAt: prev && prev > start ? prev : start }).where(eq(P.id, l.productId));
  }
  return { id: pu.id };
}

/** İstanbul günü (YYYY-MM-DD). */
const dayOf = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export async function cancelPurchase(tx: Tx, userId: string | null, id: string): Promise<string | null> {
  const [pu] = await tx.update(Pu).set({ status: "iptal" }).where(and(eq(Pu.id, id), eq(Pu.status, "kayitli"))).returning({ id: Pu.id, storeId: Pu.storeId, tenantId: Pu.tenantId });
  if (!pu) return "Alış bulunamadı ya da zaten iptal.";
  const lines = await tx.select({ productId: PL.productId, qtyMilli: PL.qtyMilli }).from(PL).where(eq(PL.purchaseId, id));
  if (lines.length) await tx.insert(schema.stockMovements).values(lines.map((l) => ({ tenantId: pu.tenantId, storeId: pu.storeId, productId: l.productId, kind: "alis" as const, qtyMilli: -l.qtyMilli, purchaseId: id, actor: userId ? `user:${userId}` : "system", note: "alış iptali" })));
  return null;
}

/** Tedarikçi listesi bakiyeleriyle (pozitif = borcumuz). */
export async function suppliersWithBalance(tx: Tx) {
  const S = schema.suppliers, SP = schema.supplierPayments;
  const [sups, buys, pays] = await Promise.all([
    tx.select().from(S).orderBy(S.name),
    tx.select({ supplierId: Pu.supplierId, total: sql<number>`sum(${Pu.total})::int` }).from(Pu).where(eq(Pu.status, "kayitli")).groupBy(Pu.supplierId),
    tx.select({ supplierId: SP.supplierId, total: sql<number>`sum(${SP.amount})::int` }).from(SP).groupBy(SP.supplierId),
  ]);
  const b = new Map(buys.map((x) => [x.supplierId, x.total])), p = new Map(pays.map((x) => [x.supplierId, x.total]));
  return sups.map((s) => ({ ...s, balance: (b.get(s.id) ?? 0) - (p.get(s.id) ?? 0) }));
}

/** Tedarikçi dökümü: alışlar (+) ve ödemeler (−) tarih sırasıyla, bakiye. */
export async function supplierStatement(tx: Tx, supplierId: string) {
  const SP = schema.supplierPayments;
  const [buys, pays] = await Promise.all([
    tx.select({ id: Pu.id, date: Pu.date, docNo: Pu.docNo, total: Pu.total, status: Pu.status, createdAt: Pu.createdAt }).from(Pu).where(eq(Pu.supplierId, supplierId)).orderBy(desc(Pu.date)),
    tx.select({ id: SP.id, date: SP.date, amount: SP.amount, method: SP.method, note: SP.note, createdAt: SP.createdAt }).from(SP).where(eq(SP.supplierId, supplierId)).orderBy(desc(SP.date)),
  ]);
  const rows = [
    ...buys.map((x) => ({ id: x.id, date: x.date, at: x.createdAt, kind: "alis" as const, text: x.docNo ? `Alış · ${x.docNo}` : "Alış", amount: x.total, cancelled: x.status === "iptal" })),
    ...pays.map((x) => ({ id: x.id, date: x.date, at: x.createdAt, kind: "odeme" as const, text: `Ödeme · ${x.method}${x.note ? ` · ${x.note}` : ""}`, amount: -x.amount, cancelled: false })),
  ].sort((a, b) => (a.date === b.date ? b.at.getTime() - a.at.getTime() : a.date < b.date ? 1 : -1));
  return { rows, balance: supplierBalance(buys, pays) };
}
