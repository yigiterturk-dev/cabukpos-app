"use server";
// Stok hareketleri (yönetim): fire (−, not zorunlu), sayım (mutlak). Alış M7'den beri alış fişiyle (purchase-actions). Yönetim ilk şubeyi kullanır (M1 tek şube).
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseQty, stockUnitOf } from "@/lib/core/stock";
import { firstStoreId } from "./stock";

export type StockState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;

export async function addStockMove(productId: string, _: StockState, form: FormData): Promise<StockState> {
  const a = await requireAdmin();
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
    const storeId = await firstStoreId(tx);
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
