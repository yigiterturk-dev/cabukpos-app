// lib/core/stock.ts — Stok = son sayım (mutlak) + sayım anından sonraki hareketler. Sayımsız: tüm hareketlerin toplamı.
export const STOCK_KINDS = ["satis", "iade", "alis", "sayim", "fire", "recete", "uretim"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];
export type StockMove = { kind: StockKind; qtyMilli: number; at: string };

export function stockLevel(moves: StockMove[]): number {
  let count: StockMove | null = null;
  for (const m of moves) if (m.kind === "sayim" && (!count || m.at > count.at)) count = m;
  let level = count ? count.qtyMilli : 0;
  for (const m of moves) if (m.kind !== "sayim" && (!count || m.at > count.at)) level += m.qtyMilli;
  return level;
}

export const STOCK_UNITS = ["adet", "kg", "lt"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];
/** "tartili" = satılan tartılı ürün (kg); eski çağıranlar için. */
export type QtyUnit = StockUnit | "tartili";
const unitOf = (u: QtyUnit): StockUnit => (u === "tartili" ? "kg" : u);

/** Stok formu miktarı: adet tam sayı, kg/lt en çok 3 ondalık → qtyMilli. Sayımda 0 serbest. */
export function parseQty(s: string, unit: QtyUnit, allowZero = false): number | null {
  const t = s.trim().replace(",", ".");
  const re = unitOf(unit) === "adet" ? /^\d{1,6}$/ : /^\d{1,6}(\.\d{1,3})?$/;
  if (!re.test(t)) return null;
  const [int, frac = ""] = t.split(".");
  const q = Number(int) * 1000 + Number(frac.padEnd(3, "0"));
  return q > 0 || (allowZero && q === 0) ? q : null;
}

export function formatQty(q: number, unit: QtyUnit): string {
  const u = unitOf(unit);
  const sign = q < 0 ? "−" : "";
  const a = Math.abs(q);
  return u === "adet" ? `${sign}${a / 1000}` : `${sign}${(a / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${u}`;
}
