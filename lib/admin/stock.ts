// lib/admin/stock.ts — Stok düzeyi (sunucu, RLS içinde). Kural lib/core/stock.ts ile aynı:
// son sayımın mutlak değeri + sayım anından sonraki hareketler.
import { asc, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { stockUnitOf, type StockUnit } from "@/lib/core/stock";

/** unit = stok birimi (stockUnitOf); cost kuruş/birim; minStock qtyMilli. */
export type StockRow = { id: string; name: string; unit: StockUnit; level: number; cost: number | null; minStock: number | null; sellable: boolean };

export async function stockLevels(tx: Tx, storeId: string): Promise<StockRow[]> {
  const rows = await tx.execute<{ id: string; name: string; kind: "adet" | "tartili"; unit: StockUnit; sellable: boolean; cost: number | null; min_stock: number | null; level: string }>(sql`
    with last_count as (
      select distinct on (product_id) product_id, qty_milli, at
      from stock_movements where kind = 'sayim' and store_id = ${storeId}
      order by product_id, at desc
    )
    select p.id, p.name, p.kind, p.unit, p.sellable, p.cost, p.min_stock,
      coalesce(lc.qty_milli, 0) + coalesce((
        select sum(m.qty_milli) from stock_movements m
        where m.product_id = p.id and m.store_id = ${storeId} and m.kind <> 'sayim' and (lc.at is null or m.at > lc.at)
      ), 0) as level
    from products p left join last_count lc on lc.product_id = p.id
    where p.track_stock
    order by p.name`);
  return rows.map((r) => ({ id: r.id, name: r.name, unit: stockUnitOf(r), level: Number(r.level), cost: r.cost, minStock: r.min_stock, sellable: r.sellable }));
}

/** Yönetim M1'den beri ilk şubeyi kullanır. */
export async function firstStoreId(tx: Tx) {
  const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(asc(schema.stores.createdAt)).limit(1);
  return s?.id ?? null;
}
