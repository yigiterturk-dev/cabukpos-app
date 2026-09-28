// lib/admin/stock.ts — Stok düzeyi (sunucu, RLS içinde). Kural lib/core/stock.ts ile aynı:
// son sayımın mutlak değeri + sayım anından sonraki hareketler.
import { asc, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";

export type StockRow = { id: string; name: string; kind: "adet" | "tartili"; level: number };

export async function stockLevels(tx: Tx, storeId: string): Promise<StockRow[]> {
  const rows = await tx.execute<{ id: string; name: string; kind: "adet" | "tartili"; level: string }>(sql`
    with last_count as (
      select distinct on (product_id) product_id, qty_milli, at
      from stock_movements where kind = 'sayim' and store_id = ${storeId}
      order by product_id, at desc
    )
    select p.id, p.name, p.kind,
      coalesce(lc.qty_milli, 0) + coalesce((
        select sum(m.qty_milli) from stock_movements m
        where m.product_id = p.id and m.store_id = ${storeId} and m.kind <> 'sayim' and (lc.at is null or m.at > lc.at)
      ), 0) as level
    from products p left join last_count lc on lc.product_id = p.id
    where p.track_stock
    order by p.name`);
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, level: Number(r.level) }));
}

/** Yönetim M1'den beri ilk şubeyi kullanır. */
export async function firstStoreId(tx: Tx) {
  const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(asc(schema.stores.createdAt)).limit(1);
  return s?.id ?? null;
}
