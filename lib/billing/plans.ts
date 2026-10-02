// lib/billing/plans.ts — Katmanlı planlar. Taban fiyat + ek şube/terminal birim fiyatları env'den (kuruş, KDV dahil);
// taban boşsa o dönem satın alınamaz. Birim fiyat boşsa o bileşen ek ücretsizdir (düz model).
import type { BillingPeriod, UnitCounts, UnitPrices } from "@/lib/core/billing";
import { planBreakdown } from "@/lib/core/billing";

const price = (v: string | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const env = (p: BillingPeriod, aylik: string, yillik: string) => (p === "aylik" ? process.env[aylik] : process.env[yillik]);

export const planPrice = (p: BillingPeriod): number | null => price(env(p, "PLAN_PRICE_AYLIK", "PLAN_PRICE_YILLIK"));
export const unitPrices = (p: BillingPeriod): UnitPrices | null => {
  const base = planPrice(p);
  if (!base) return null;
  return { base, store: price(env(p, "PLAN_PRICE_STORE_AYLIK", "PLAN_PRICE_STORE_YILLIK")), device: price(env(p, "PLAN_PRICE_DEVICE_AYLIK", "PLAN_PRICE_DEVICE_YILLIK")) };
};
export const planPriceFor = (p: BillingPeriod, c: UnitCounts): number | null => { const u = unitPrices(p); return u ? planBreakdown(u, c).total : null; };
export const salesContact = () => process.env.SALES_CONTACT || null;
