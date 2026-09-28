// lib/core/shift.ts — Vardiya (gün sonu) özeti (saf). Nakit = alınan nakit − para üstü − nakit iade.
// İade (refund) brütten, ödeme türünden ve KDV'den düşer.
import type { Kurus, VatRate } from "./money";
import type { VatLine } from "./cart";
import { splitVat } from "./money";
import type { Payment, PayMethod } from "./payment";

export type ShiftSale = { total: Kurus; change: Kurus; payments: Payment[]; vat: VatLine[]; refund?: boolean };

export function summarizeShift(openingCash: Kurus, sales: ShiftSale[]) {
  const byMethod: Record<PayMethod, Kurus> = { nakit: 0, kart: 0, yemek_karti: 0, online: 0 };
  const byRate = new Map<VatRate, Kurus>();
  let gross = 0, saleCount = 0, refundCount = 0, refundTotal = 0;
  for (const s of sales) {
    const k = s.refund ? -1 : 1;
    if (s.refund) { refundCount++; refundTotal += s.total; } else saleCount++;
    gross += k * s.total;
    for (const p of s.payments) byMethod[p.method] += k * p.amount;
    byMethod.nakit -= k * s.change;
    for (const v of s.vat) byRate.set(v.rate, (byRate.get(v.rate) ?? 0) + k * v.gross);
  }
  const vat = [...byRate].filter(([, g]) => g !== 0).sort(([a], [b]) => a - b).map(([rate, g]) => ({ rate, gross: g, ...splitVat(g, rate) }));
  return { saleCount, refundCount, refundTotal, gross, byMethod, netCash: byMethod.nakit, expectedCash: openingCash + byMethod.nakit, vat };
}
