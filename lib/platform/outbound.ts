// lib/platform/outbound.ts — #29: eşlenmiş ürünleri (ad, fiyat, stok) platforma geri yazar (sunucu; ağ DB işlemi dışında).
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { stockLevels } from "@/lib/admin/stock";
import { connectionFor, sourceFor } from "./index";
import type { OutboundItem } from "./types";

export type PushCatalogResult =
  | { error: "not_connected" | "unsupported" | "no_items" }
  | { ok: number; failed: number; total: number };

export async function pushStoreCatalog(tenantId: string, storeId: string, platform: string, actor: string): Promise<PushCatalogResult> {
  const conn = await connectionFor(tenantId, storeId, platform);
  if (!conn || !conn.active) return { error: "not_connected" };
  const source = sourceFor(platform);
  if (!source?.pushCatalog) return { error: "unsupported" };

  const items = await withTenant(tenantId, async (tx) => {
    const C = schema.productPlatformCodes, P = schema.products;
    const rows = await tx.select({ code: C.code, id: P.id, name: P.name, price: P.price, active: P.active, sellable: P.sellable })
      .from(C).innerJoin(P, eq(P.id, C.productId)).where(and(eq(C.storeId, storeId), eq(C.platform, platform), eq(P.sellable, true)));
    const stock = new Map((await stockLevels(tx, storeId)).map((s) => [s.id, s.level]));
    return rows.map((r): OutboundItem => ({ code: r.code, name: r.name, price: r.price, stock: stock.get(r.id) ?? null, active: r.active }));
  });
  if (!items.length) return { error: "no_items" };

  const r = await source.pushCatalog(conn, items);
  if ("error" in r) return { error: "unsupported" }; // adaptör kapalı/bağlantı yok — ayrıntısı audit'te
  await withTenant(tenantId, (tx) => audit(tx, tenantId, actor, "platform.catalog.push", { platform, storeId, ok: r.ok, failed: r.failed, total: items.length }));
  return { ok: r.ok, failed: r.failed, total: items.length };
}
