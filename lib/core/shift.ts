// lib/core/shift.ts — Vardiya (gün sonu) özeti (saf). Nakit = alınan nakit − para üstü − nakit iade.
// İade (refund) brütten, ödeme türünden ve KDV'den düşer.
import type { Kurus, VatRate } from "./money";
import type { VatLine } from "./cart";
import { splitVat } from "./money";
import type { Payment, PayMethod } from "./payment";

export type ShiftSale = { total: Kurus; change: Kurus; payments: Payment[]; vat: VatLine[]; refund?: boolean; discount?: Kurus };

/** #48: TR banknot/bozuk değerleri (kuruş) — sayım paneli sırası. */
export const BANKNOTES = [20_000, 10_000, 5000, 2000, 1000, 500] as const;
export const COINS = [100, 50, 25, 10, 5] as const;
export type CashBreakdown = Partial<Record<(typeof BANKNOTES)[number] | (typeof COINS)[number], number>>;

/** Kırılım adetlerinden kasa toplamı (kuruş). */
export const countCash = (b: CashBreakdown): Kurus =>
  Object.entries(b).reduce((s, [v, n]) => s + Number(v) * Math.max(0, Math.floor(n ?? 0)), 0);

export function summarizeShift(openingCash: Kurus, sales: ShiftSale[], drops: Kurus[] = []) {
  const byMethod: Record<PayMethod, Kurus> = { nakit: 0, kart: 0, yemek_karti: 0, online: 0, hediye_karti: 0 };
  const byRate = new Map<VatRate, Kurus>();
  let gross = 0, saleCount = 0, refundCount = 0, refundTotal = 0;
  for (const s of sales) {
    const k = s.refund ? -1 : 1;
    const net = s.total - (s.discount ?? 0); // #33: ciro satış düzeyi indirim düşülmüş (net)
    if (s.refund) { refundCount++; refundTotal += net; } else saleCount++;
    gross += k * net;
    for (const p of s.payments) byMethod[p.method] += k * p.amount;
    byMethod.nakit -= k * s.change;
    for (const v of s.vat) byRate.set(v.rate, (byRate.get(v.rate) ?? 0) + k * v.gross);
  }
  const vat = [...byRate].filter(([, g]) => g !== 0).sort(([a], [b]) => a - b).map(([rate, g]) => ({ rate, gross: g, ...splitVat(g, rate) }));
  const dropped = drops.reduce((s, d) => s + d, 0);
  return { saleCount, refundCount, refundTotal, gross, byMethod, netCash: byMethod.nakit, dropped, expectedCash: openingCash + byMethod.nakit - dropped, vat };
}
