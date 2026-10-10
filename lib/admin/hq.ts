// lib/admin/hq.ts — Zincir merkezi (HQ): şube başına dönem özeti. withTenant içinde çağrılır.
// Rapor sorgularıyla aynı kapı: kapalı/iade satışlar, maliyeti donmuş satırlardan kâr.
import { and, eq, inArray, lt, gte, sql, type SQL } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { rangeBounds, type Range } from "@/lib/core/report";

export type HqBranch = { storeId: string; name: string; sales: number; count: number; refunds: number; cost: number; noCost: number; avg: number; profit: number };
export type HqData = { range: Range; total: Omit<HqBranch, "storeId" | "name">; branches: HqBranch[] };

const S = schema.sales, L = schema.saleLines, ST = schema.stores;

export async function hqData(tx: Tx, r: Range): Promise<HqData> {
  const { from, to } = rangeBounds(r);
  const where = and(inArray(S.status, ["kapandi", "iade"]), gte(S.createdAt, from), lt(S.createdAt, to)) as SQL;
  const stores = await tx.select({ id: ST.id, name: ST.name }).from(ST).orderBy(ST.name);
  // Satış düzeyi: ciro/iade/adet (satırlarla join'lersek satır sayısıyla çarpılır)
  const saleRows = await tx.select({
    storeId: S.storeId,
    total: sql<number>`sum(case when ${S.status} = 'iade' then 0 else ${S.total} end)::int`,
    refund: sql<number>`sum(case when ${S.status} = 'iade' then ${S.total} else 0 end)::int`,
    count: sql<number>`sum(case when ${S.status} = 'iade' then 0 else 1 end)::int`,
  }).from(S).where(where).groupBy(S.storeId);
  // Satır düzeyi: donmuş maliyet + maliyetsiz satır sayısı
  const lineRows = await tx.select({
    storeId: S.storeId,
    cost: sql<number>`coalesce(sum(case when ${L.cost} is not null and ${S.status} <> 'iade' then ${L.cost} * (${L.qtyMilli}::numeric / 1000) else 0 end), 0)::int`,
    noCost: sql<number>`sum(case when ${L.cost} is null and ${S.status} <> 'iade' then 1 else 0 end)::int`,
  }).from(L).innerJoin(S, eq(S.id, L.saleId)).where(where).groupBy(S.storeId);
  const byStore = new Map(saleRows.map((x) => [x.storeId, x]));
  const costByStore = new Map(lineRows.map((x) => [x.storeId, x]));
  const mk = (storeId: string, name: string): HqBranch => {
    const x = byStore.get(storeId), c = costByStore.get(storeId);
    const sales = x?.total ?? 0, cost = c?.cost ?? 0, count = x?.count ?? 0;
    return { storeId, name, sales, count, refunds: x?.refund ?? 0, cost, noCost: c?.noCost ?? 0, avg: count ? Math.round(sales / count) : 0, profit: sales - cost };
  };
  const branches = stores.map((s) => mk(s.id, s.name));
  const tot = branches.reduce((a, b) => ({ sales: a.sales + b.sales, count: a.count + b.count, refunds: a.refunds + b.refunds, cost: a.cost + b.cost, noCost: a.noCost + b.noCost, avg: 0, profit: a.profit + b.profit }), { sales: 0, count: 0, refunds: 0, cost: 0, noCost: 0, avg: 0, profit: 0 });
  tot.avg = tot.count ? Math.round(tot.sales / tot.count) : 0;
  return { range: r, total: tot, branches };
}
