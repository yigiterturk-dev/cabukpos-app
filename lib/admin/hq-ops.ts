// lib/admin/hq-ops.ts — HQ canlı operasyon: şube başına açık vardiya, bekleyen çağrı,
// kritik stok, aktif cihaz/ajan ve son satış. withTenant içinde çağrılır.
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { isCritical } from "@/lib/core/recipe";
import { stockLevels } from "./stock";
import { openTabCounts } from "./tabs";
import type { StockUnit } from "@/lib/core/stock";

export type StoreOps = {
  storeId: string;
  name: string;
  openShifts: number;
  openCalls: number;
  openTabs: number;
  openTabRemaining: number;
  criticalStock: number;
  devices: number;
  onlineAgents: number;
  lastSaleAt: Date | null;
  waste30d: number; // son 30 gün fire maliyeti (kuruş); maliyeti olmayan satırlar 0
};

export async function hqOps(tx: Tx, tenantId: string): Promise<StoreOps[]> {
  const S = schema.stores, SH = schema.shifts, C = schema.tableCalls, SA = schema.sales, D = schema.devices, A = schema.agents, M = schema.stockMovements, P = schema.products;
  const stores = await tx.select({ id: S.id, name: S.name }).from(S).orderBy(S.name);
  const [shifts, calls, sales, devices, agents, waste] = await Promise.all([
    tx.select({ storeId: SH.storeId, n: count() }).from(SH).where(isNull(SH.closedAt)).groupBy(SH.storeId),
    tx.select({ storeId: C.storeId, n: count() }).from(C).where(isNull(C.resolvedAt)).groupBy(C.storeId),
    tx.select({ storeId: SA.storeId, last: sql<Date | null>`max(${SA.createdAt})` }).from(SA).groupBy(SA.storeId),
    // devices/agents RLS dışı kimlik tabloları → kiracı koşulu açıkça verilir.
    tx.select({ storeId: D.storeId, n: count() }).from(D).where(and(eq(D.tenantId, tenantId), isNull(D.revokedAt))).groupBy(D.storeId),
    tx.select({ storeId: A.storeId, n: count() }).from(A).where(and(eq(A.tenantId, tenantId), isNull(A.revokedAt), sql`${A.lastSeenAt} > now() - interval '3 minutes'`)).groupBy(A.storeId),
    tx.select({ storeId: M.storeId, cost: sql<number>`coalesce(sum(case when ${P.cost} is not null then ((-${M.qtyMilli})::numeric * ${P.cost}) / 1000 else 0 end), 0)::int` })
      .from(M).innerJoin(P, eq(P.id, M.productId))
      .where(and(eq(M.kind, "fire"), gte(M.at, sql`now() - interval '30 days'`)))
      .groupBy(M.storeId),
  ]);
  const byStore = <T extends { storeId: string }>(rows: T[]) => new Map(rows.map((r) => [r.storeId, r]));
  const shiftMap = byStore(shifts), callMap = byStore(calls), saleMap = byStore(sales), deviceMap = byStore(devices), agentMap = byStore(agents), wasteMap = byStore(waste);
  const tabMap = await openTabCounts(tx);

  const out: StoreOps[] = [];
  for (const s of stores) {
    const criticalStock = (await stockLevels(tx, s.id)).filter((r) => isCritical(r.level, r.minStock)).length;
    out.push({
      storeId: s.id,
      name: s.name,
      openShifts: shiftMap.get(s.id)?.n ?? 0,
      openCalls: callMap.get(s.id)?.n ?? 0,
      openTabs: tabMap.get(s.id)?.open ?? 0,
      openTabRemaining: tabMap.get(s.id)?.remaining ?? 0,
      criticalStock,
      devices: deviceMap.get(s.id)?.n ?? 0,
      onlineAgents: agentMap.get(s.id)?.n ?? 0,
      lastSaleAt: saleMap.get(s.id)?.last ?? null,
      waste30d: wasteMap.get(s.id)?.cost ?? 0,
    });
  }
  return out;
}

export type CriticalStockRow = { storeId: string; storeName: string; productId: string; name: string; unit: StockUnit; level: number; minStock: number };

/** Tüm şubelerde kritik seviyedeki stoklar; transfer hedefi seçmek için şube kimliği taşır. */
export async function hqCriticalStock(tx: Tx): Promise<CriticalStockRow[]> {
  const stores = await tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).orderBy(schema.stores.name);
  const out: CriticalStockRow[] = [];
  for (const s of stores) {
    for (const r of await stockLevels(tx, s.id)) {
      if (isCritical(r.level, r.minStock)) out.push({ storeId: s.id, storeName: s.name, productId: r.id, name: r.name, unit: r.unit, level: r.level, minStock: r.minStock ?? 0 });
    }
  }
  return out;
}
