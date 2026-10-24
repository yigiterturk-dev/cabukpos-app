// lib/core/franchise.ts — franchise hakediş kuralları (saf): ciro payı (bps) + gün oranlı sabit bedel.
// Net ciro = indirim düşülmüş, iade hariç satış (HQ raporuyla aynı tanım).
import { parseTL } from "./money";

export type FranchiseTerms = { royaltyBps: number | null; monthlyFee: number | null };
export type FranchiseCharge = { royalty: number; fixed: number; total: number };

/** "5", "5,5", "5.5" → 550 bps. Boş → null; geçersiz → "invalid". */
export function parseRoyaltyBps(raw: string): number | null | "invalid" {
  const s = raw.trim().replace("%", "").replace(",", ".");
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return "invalid";
  const pct = Number(s);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return "invalid";
  return Math.round(pct * 100);
}

/** Ciro payı: net ciro × bps / 10000, kuruşa yuvarlanır. */
export function royaltyCharge(netSales: number, bps: number | null): number {
  if (!bps || netSales <= 0) return 0;
  return Math.round((netSales * bps) / 10_000);
}

const DAY = 86_400_000;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Sabit aylık bedeli rapor aralığına gün oranıyla böler.
 * Ay sınırını aşan aralıkta her ayın kendi gün sayısı kullanılır (Şubat 28/29, Ocak 31).
 */
export function proratedMonthlyFee(monthlyFee: number | null, bas: string, bit: string): number {
  if (!monthlyFee || monthlyFee <= 0) return 0;
  const start = Date.parse(`${bas}T00:00:00Z`);
  const end = Date.parse(`${bit}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  let total = 0;
  let cursor = start;
  while (cursor <= end) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const monthStart = Date.UTC(y, m - 1, 1), monthEnd = Date.UTC(y, m, 0);
    const from = Math.max(cursor, monthStart), to = Math.min(end, monthEnd);
    const covered = Math.floor((to - from) / DAY) + 1;
    total += (monthlyFee * covered) / daysInMonth(y, m);
    cursor = monthEnd + DAY;
  }
  return Math.round(total);
}

export function franchiseCharge(terms: FranchiseTerms, netSales: number, bas: string, bit: string): FranchiseCharge {
  const royalty = royaltyCharge(netSales, terms.royaltyBps);
  const fixed = proratedMonthlyFee(terms.monthlyFee, bas, bit);
  return { royalty, fixed, total: royalty + fixed };
}

/** Depo franchise raporuna girmez; yalnız satış şubeleri. */
export const isFranchiseStore = (kind: "sube" | "depo" | null | undefined) => kind !== "depo";

/** Formdan gelen bedeli kuruşa çevirir: boş → null, geçersiz/negatif/aşırı → "invalid". */
export function parseFeeKurus(raw: string): number | null | "invalid" {
  if (!raw.trim()) return null;
  const k = parseTL(raw);
  if (k === null || k < 0 || k > 100_000_000) return "invalid";
  return k;
}
