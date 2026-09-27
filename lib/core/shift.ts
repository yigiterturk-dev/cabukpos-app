// lib/core/shift.ts — Vardiya (gün sonu) özeti (saf). Nakit = alınan nakit − para üstü.
import type { Kurus, VatRate } from "./money";
import type { VatLine } from "./cart";
import { splitVat } from "./money";
import type { Payment, PayMethod } from "./payment";

export type ShiftSale = { total: Kurus; change: Kurus; payments: Payment[]; vat: VatLine[] };

export function summarizeShift(openingCash: Kurus, sales: ShiftSale[]) {
  const byMethod: Record<PayMethod, Kurus> = { nakit: 0, kart: 0, yemek_karti: 0 };
  const byRate = new Map<VatRate, Kurus>();
  let gross = 0;
  for (const s of sales) {
    gross += s.total;
    for (const p of s.payments) byMethod[p.method] += p.amount;
    byMethod.nakit -= s.change;
    for (const v of s.vat) byRate.set(v.rate, (byRate.get(v.rate) ?? 0) + v.gross);
  }
  const vat = [...byRate].sort(([a], [b]) => a - b).map(([rate, g]) => ({ rate, gross: g, ...splitVat(g, rate) }));
  return { saleCount: sales.length, gross, byMethod, netCash: byMethod.nakit, expectedCash: openingCash + byMethod.nakit, vat };
}
