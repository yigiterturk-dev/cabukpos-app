// lib/billing/plans.ts — Tek paket. Fiyat kararlaştırılınca env'den (kuruş, KDV dahil); boşsa o dönem satın alınamaz.
import type { BillingPeriod } from "@/lib/core/billing";

const price = (v: string | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
export const planPrice = (p: BillingPeriod): number | null => price(p === "aylik" ? process.env.PLAN_PRICE_AYLIK : process.env.PLAN_PRICE_YILLIK);
export const salesContact = () => process.env.SALES_CONTACT || null;
