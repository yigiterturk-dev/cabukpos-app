// lib/core/stock.ts — Stok = son sayım (mutlak) + sayım anından sonraki hareketler. Sayımsız: tüm hareketlerin toplamı.
export const STOCK_KINDS = ["satis", "iade", "alis", "sayim", "fire"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];
export type StockMove = { kind: StockKind; qtyMilli: number; at: string };

export function stockLevel(moves: StockMove[]): number {
  let count: StockMove | null = null;
  for (const m of moves) if (m.kind === "sayim" && (!count || m.at > count.at)) count = m;
  let level = count ? count.qtyMilli : 0;
  for (const m of moves) if (m.kind !== "sayim" && (!count || m.at > count.at)) level += m.qtyMilli;
  return level;
}
