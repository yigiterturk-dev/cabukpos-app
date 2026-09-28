// lib/platform/ingest.ts — Platform siparişini adisyon olayı olarak yazar (sunucu kaynaklı: cihaz/personel boş).
// Aynı externalId ikinci kez gelirse yazılmaz (kilit + kontrol; kısmi benzersiz indeks son savunma).
// Otomatik kabulde accept + istasyona göre send de yazılır, platform işlem sonrası bilgilendirilir.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/db";
import { isVatRate } from "@/lib/core/money";
import { sendByStation, toTabEvents, type IncomingOrder, type MappedProduct } from "@/lib/core/platform";
import type { TabEv } from "@/lib/core/tab";
import { upsertCustomer } from "@/lib/sync/apply";
import { notifyPlatform } from "./notify";
import type { Conn } from "./types";

export const AUTO_PREP_MIN = 20;

export type IngestResult = { created: number; duplicates: number; unmapped: number };

export async function ingestOrders(conn: Conn, orders: IncomingOrder[]): Promise<IngestResult> {
  const r: IngestResult = { created: 0, duplicates: 0, unmapped: 0 };
  for (const o of orders) {
    const out = await withTenant(conn.tenantId, async (tx) => {
      const E = schema.tabEvents;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${conn.storeId}:${o.externalId}`}))`);
      const [dup] = await tx.select({ id: E.id }).from(E).where(and(eq(E.storeId, conn.storeId), eq(E.type, "order"), sql`${E.payload}->'source'->>'externalId' = ${o.externalId}`));
      if (dup) return null;
      const codes = await codeMap(tx, conn);
      const { events, unmapped } = toTabEvents(o, conn.platform, codes, () => crypto.randomUUID());
      const adds = events.filter((e): e is Extract<TabEv, { type: "add" }> => e.type === "add");
      let acceptId: string | null = null;
      const all: TabEv[] = [...events];
      if (conn.autoAccept) all.push({ type: "accept", prepMin: AUTO_PREP_MIN }, ...sendByStation(adds, () => crypto.randomUUID()));
      const tabId = crypto.randomUUID();
      const base = Date.now();
      const rows = all.map((ev, i) => {
        const id = crypto.randomUUID();
        if (ev.type === "accept") acceptId = id;
        return { id, tenantId: conn.tenantId, storeId: conn.storeId, tabId, tableId: null, deviceId: null, staffId: null, at: new Date(base + i), type: ev.type, payload: ev, review: ev.type === "order" && unmapped ? `eşlenmeyen ürün: ${unmapped}` : null };
      });
      await tx.insert(E).values(rows);
      const ord = all.find((e): e is Extract<TabEv, { type: "order" }> => e.type === "order")!;
      await upsertCustomer(tx, conn.tenantId, ord);
      return { unmapped, tabId, acceptId: acceptId as string | null };
    });
    if (!out) { r.duplicates++; continue; }
    r.created++;
    r.unmapped += out.unmapped;
    if (out.acceptId) await notifyPlatform(conn.tenantId, out.acceptId, out.tabId, { type: "accept", prepMin: AUTO_PREP_MIN });
  }
  return r;
}


/** Şubenin dış kod → ürün eşlemesi (istasyon: ürün ?? kategori). */
async function codeMap(tx: Tx, conn: Conn): Promise<Map<string, MappedProduct>> {
  const C = schema.productPlatformCodes, P = schema.products, K = schema.categories;
  const rows = await tx.select({ code: C.code, id: P.id, name: P.name, vatRate: P.vatRate, stationId: P.stationId, catStation: K.stationId })
    .from(C).innerJoin(P, eq(P.id, C.productId)).leftJoin(K, eq(K.id, P.categoryId))
    .where(and(eq(C.storeId, conn.storeId), eq(C.platform, conn.platform)));
  return new Map(rows.filter((x) => isVatRate(x.vatRate)).map((x) => [x.code, { id: x.id, name: x.name, vatRate: x.vatRate as MappedProduct["vatRate"], stationId: x.stationId ?? x.catStation ?? null }]));
}
