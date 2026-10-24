// lib/platform/ingest.ts — Platform siparişini adisyon olayı olarak yazar (sunucu kaynaklı: cihaz/personel boş).
// Aynı şube + platform + externalId ikinci kez gelirse yazılmaz (kilit + kontrol + benzersiz indeks).
// Otomatik kabulde accept + istasyona göre send de yazılır, platform işlem sonrası bilgilendirilir.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/db";
import { isVatRate } from "@/lib/core/money";
import { sendByStation, toTabEvents, AUTO_PREP_MIN, type IncomingOrder, type MappedProduct } from "@/lib/core/platform";
import type { TabEv } from "@/lib/core/tab";
import { upsertCustomer } from "@/lib/sync/apply";
import { categoryStationForStore, loadStoreStationRoutes, productStationForStore } from "@/lib/core/station-routing";
import { notifyPlatform } from "./notify";
import type { Conn } from "./types";

export { AUTO_PREP_MIN }; // geriye uyumlu: eski içe aktarmalar kırılmasın

export type IngestResult = { created: number; duplicates: number; unmapped: number };

export async function ingestOrders(conn: Conn, orders: IncomingOrder[]): Promise<IngestResult> {
  const r: IngestResult = { created: 0, duplicates: 0, unmapped: 0 };
  for (const o of orders) {
    const out = await withTenant(conn.tenantId, async (tx) => {
      const E = schema.tabEvents;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([conn.storeId, conn.platform, o.externalId])}))`);
      const [dup] = await tx.select({ tabId: E.tabId }).from(E).where(and(eq(E.storeId, conn.storeId), eq(E.type, "order"), sql`${E.payload}->'source'->>'platform' = ${conn.platform}`, sql`${E.payload}->'source'->>'externalId' = ${o.externalId}`));
      if (dup) {
        // Reuse the persisted decision, never rebuild the order or send another kitchen ticket.
        const [accept] = await tx.select({ id: E.id, payload: E.payload }).from(E).where(and(eq(E.tabId, dup.tabId), eq(E.type, "accept"))).orderBy(E.at, E.id).limit(1);
        return { duplicate: true, unmapped: 0, tabId: dup.tabId, acceptId: accept?.id ?? null, prepMin: accept ? (accept.payload as Extract<TabEv, { type: "accept" }>).prepMin : AUTO_PREP_MIN };
      }
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
      return { duplicate: false, unmapped, tabId, acceptId: acceptId as string | null, prepMin: AUTO_PREP_MIN };
    });
    if (!out) { r.duplicates++; continue; }
    if (out.duplicate) r.duplicates++;
    else r.created++;
    r.unmapped += out.unmapped;
    if (out.acceptId) await notifyPlatform(conn.tenantId, out.acceptId, out.tabId, { type: "accept", prepMin: out.prepMin });
  }
  return r;
}


/** Şubenin dış kod → ürün eşlemesi (istasyon: ürün ?? kategori). */
async function codeMap(tx: Tx, conn: Conn): Promise<Map<string, MappedProduct>> {
  const C = schema.productPlatformCodes, P = schema.products, K = schema.categories;
  const rows = await tx.select({ code: C.code, id: P.id, name: P.name, vatRate: P.vatRate, categoryId: P.categoryId, stationId: P.stationId, catStation: K.stationId })
    .from(C).innerJoin(P, eq(P.id, C.productId)).leftJoin(K, eq(K.id, P.categoryId))
    .where(and(eq(C.storeId, conn.storeId), eq(C.platform, conn.platform)));
  const routes = await loadStoreStationRoutes(tx, conn.storeId);
  const categoryStations = new Map(rows.filter((x) => x.categoryId).map((x) => [x.categoryId!, categoryStationForStore(x.categoryId!, x.catStation, routes)]));
  return new Map(rows.filter((x) => isVatRate(x.vatRate)).map((x) => [x.code, { id: x.id, name: x.name, vatRate: x.vatRate as MappedProduct["vatRate"], stationId: productStationForStore(x.id, x.stationId, x.categoryId ? categoryStations.get(x.categoryId) ?? null : null, routes) }]));
}
