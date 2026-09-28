// lib/core/profit.ts — Ürün kârlılığı. Ciro KDV hariç ve indirim düşülmüş (sale_lines.total zaten indirimli);
// maliyet eşitlemede donan sale_lines.cost. İade satırları düşülür. Maliyeti eksik satır ayrı sayılır, marj o üründe hesaplanmaz.
import type { Kurus } from "./money";

export type ProfitLine = { key: string; name: string; qtyMilli: number; total: Kurus; vatRate: number; cost: Kurus | null; refund: boolean };
export type ProfitRow = { key: string; name: string; qtyMilli: number; net: Kurus; cost: Kurus; profit: Kurus; margin: number | null; missing: number };

export function profitRows(lines: ProfitLine[]): ProfitRow[] {
  const by = new Map<string, ProfitRow>();
  for (const l of lines) {
    const r = by.get(l.key) ?? { key: l.key, name: l.name, qtyMilli: 0, net: 0, cost: 0, profit: 0, margin: null, missing: 0 };
    const s = l.refund ? -1 : 1;
    r.qtyMilli += s * l.qtyMilli;
    r.net += s * Math.round((l.total * 100) / (100 + l.vatRate));
    if (l.cost == null) r.missing += 1;
    else r.cost += s * l.cost;
    by.set(l.key, r);
  }
  return [...by.values()]
    .map((r) => ({ ...r, profit: r.net - r.cost, margin: r.missing || r.net <= 0 ? null : ((r.net - r.cost) / r.net) * 100 }))
    .sort((a, b) => b.profit - a.profit);
}
