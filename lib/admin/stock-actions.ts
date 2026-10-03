"use server";
// Stok hareketleri (yönetim): fire (−, not zorunlu), sayım (mutlak). Alış M7'den beri alış fişiyle (purchase-actions). Yönetim ilk şubeyi kullanır (M1 tek şube).
// #51 sayım oturumu: açılışta anlık görüntü, satır satır sayım, kapanışta sapma onayıyla mutlak sayım hareketi.
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { countApply, parseQty, stockUnitOf } from "@/lib/core/stock";
import { stockLevels } from "@/lib/admin/stock";
import { scopedStoreId } from "./store-scope";

export type StockState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;

export async function addStockMove(productId: string, _: StockState, form: FormData): Promise<StockState> {
  const a = await requireWriter();
  if (!UUID.test(productId)) return { error: "Ürün bulunamadı." };
  const kind = String(form.get("kind") ?? "");
  if (kind !== "fire" && kind !== "sayim") return { error: "Hareket türü geçersiz.", field: "kind" };
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  if (kind === "fire" && !note) return { error: "Fire için neden yazın.", field: "note" };
  const err = await withTenant(a.tenantId, async (tx) => {
    const [p] = await tx.select({ kind: schema.products.kind, unit: schema.products.unit, sellable: schema.products.sellable, trackStock: schema.products.trackStock }).from(schema.products).where(eq(schema.products.id, productId));
    if (!p?.trackStock) return { error: "Ürün stok takipli değil." };
    const unit = stockUnitOf(p);
    const q = parseQty(String(form.get("qty") ?? ""), unit, kind === "sayim");
    if (q === null) return { error: unit === "adet" ? "Miktar tam sayı olmalı." : `Miktar ${unit} (ör. 2,5).`, field: "qty" };
    const storeId = await scopedStoreId(tx, a.tenantId);
    if (!storeId) return { error: "Şube yok." };
    const qtyMilli = kind === "fire" ? -q : q;
    await tx.insert(schema.stockMovements).values({ tenantId: a.tenantId, storeId, productId, kind, qtyMilli, actor: `user:${a.id}`, note });
    await audit(tx, a.tenantId, `user:${a.id}`, `stock.${kind}`, { productId, qtyMilli, note });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/stok");
  return { savedAt: Date.now() };
}

// — #51 Sayım oturumu —

export type CountState = { error?: string; field?: string; savedAt?: number };

/** Yeni sayım: stok takipli ürünler için o anki beklenen seviye anlık görüntüsü. Açık oturum varsa hata. */
export async function startStockCount(): Promise<void> {
  const a = await requireWriter();
  await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    if (!storeId) return;
    const [open] = await tx.select({ id: schema.stockCounts.id }).from(schema.stockCounts).where(and(eq(schema.stockCounts.storeId, storeId), eq(schema.stockCounts.status, "acik"))).limit(1);
    if (open) return;
    const rows = await stockLevels(tx, storeId);
    if (rows.length === 0) return;
    const actor = `user:${a.id}`;
    const [c] = await tx.insert(schema.stockCounts).values({ tenantId: a.tenantId, storeId, openedBy: actor }).returning({ id: schema.stockCounts.id });
    await tx.insert(schema.stockCountLines).values(rows.map((r) => ({ tenantId: a.tenantId, countId: c.id, productId: r.id, expectedMilli: r.level })));
    await audit(tx, a.tenantId, actor, "count.start", { id: c.id, lines: rows.length });
  });
  revalidatePath("/yonetim/sayim");
}

/** Tek satır sayımı kaydet. */
export async function setCountedLine(countId: string, lineId: string, _: CountState, form: FormData): Promise<CountState> {
  const a = await requireWriter();
  if (!UUID.test(countId) || !UUID.test(lineId)) return { error: "Oturum bulunamadı." };
  const err = await withTenant(a.tenantId, async (tx) => {
    const [c] = await tx.select({ status: schema.stockCounts.status }).from(schema.stockCounts).where(eq(schema.stockCounts.id, countId));
    if (!c || c.status !== "acik") return { error: "Oturum kapalı.", field: "qty" };
    const [line] = await tx.select({ productId: schema.stockCountLines.productId, name: schema.products.name, kind: schema.products.kind, unit: schema.products.unit, sellable: schema.products.sellable })
      .from(schema.stockCountLines).innerJoin(schema.products, eq(schema.products.id, schema.stockCountLines.productId)).where(eq(schema.stockCountLines.id, lineId));
    if (!line) return { error: "Satır bulunamadı.", field: "qty" };
    const unit = stockUnitOf(line);
    const q = parseQty(String(form.get("qty") ?? ""), unit, true);
    if (q === null) return { error: unit === "adet" ? "Miktar tam sayı olmalı." : `Miktar ${unit} (ör. 2,5).`, field: "qty" };
    await tx.update(schema.stockCountLines).set({ countedMilli: q }).where(eq(schema.stockCountLines.id, lineId));
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/sayim");
  return { savedAt: Date.now() };
}

/** Kapanış: onay kutusu zorunlu (sapma onayı). Sayılan ve sapması olan satırlara mutlak "sayım" hareketi yazılır; sayılmayanlar dokunulmaz. */
export async function closeStockCount(countId: string, _: CountState, form: FormData): Promise<CountState> {
  const a = await requireWriter();
  if (!UUID.test(countId)) return { error: "Oturum bulunamadı." };
  if (form.get("onay") !== "on") return { error: "Sapmayı onaylayın: kapanış sayım hareketi yazar.", field: "onay" };
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  const err = await withTenant(a.tenantId, async (tx) => {
    const [c] = await tx.select({ status: schema.stockCounts.status, storeId: schema.stockCounts.storeId }).from(schema.stockCounts).where(eq(schema.stockCounts.id, countId));
    if (!c || c.status !== "acik") return { error: "Oturum kapalı ya da yok.", field: "onay" };
    const lines = await tx.select({ id: schema.stockCountLines.id, productId: schema.stockCountLines.productId, expectedMilli: schema.stockCountLines.expectedMilli, countedMilli: schema.stockCountLines.countedMilli })
      .from(schema.stockCountLines).where(eq(schema.stockCountLines.countId, countId));
    const applied = lines.map((l) => ({ productId: l.productId, apply: countApply(l) })).filter((x): x is { productId: string; apply: number } => x.apply !== null);
    if (applied.length) await tx.insert(schema.stockMovements).values(applied.map((x) => ({ tenantId: a.tenantId, storeId: c.storeId, productId: x.productId, kind: "sayim" as const, qtyMilli: x.apply, actor: `user:${a.id}`, note: `Sayım oturumu${note ? `: ${note}` : ""}` })));
    await tx.update(schema.stockCounts).set({ status: "kapandi", closedBy: `user:${a.id}`, closedAt: new Date(), note }).where(eq(schema.stockCounts.id, countId));
    await audit(tx, a.tenantId, `user:${a.id}`, "count.close", { id: countId, applied: applied.length, skipped: lines.length - applied.length });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/sayim");
  revalidatePath("/yonetim/stok");
  return { savedAt: Date.now() };
}

/** Açık oturumu iptal: hiçbir hareket yazılmaz, satırlarla birlikte silinir. */
export async function cancelStockCount(countId: string): Promise<void> {
  const a = await requireWriter();
  if (!UUID.test(countId)) return;
  await withTenant(a.tenantId, async (tx) => {
    const [c] = await tx.select({ status: schema.stockCounts.status }).from(schema.stockCounts).where(eq(schema.stockCounts.id, countId));
    if (!c || c.status !== "acik") return;
    await tx.delete(schema.stockCounts).where(eq(schema.stockCounts.id, countId));
    await audit(tx, a.tenantId, `user:${a.id}`, "count.cancel", { id: countId });
  });
  revalidatePath("/yonetim/sayim");
}
