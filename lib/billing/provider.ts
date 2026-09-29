// lib/billing/provider.ts — Ödeme sağlayıcı arayüzü. Gerçek sağlayıcı (PayTR/iyzico) = yeni dosya + webhook route → completePayment.
import type { BillingPeriod } from "@/lib/core/billing";
import { paytrBilling, paytrKeys } from "./paytr";

export type CheckoutInput = { paymentId: string; amount: number; period: BillingPeriod; tenantName: string; email: string; userIp: string; phone?: string; address?: string | null };
export interface BillingProvider {
  name: string;
  test: boolean;
  start(p: CheckoutInput): Promise<{ redirectUrl: string }>;
}

export const fakeBilling: BillingProvider = {
  name: "fake",
  test: true,
  start: async (p) => ({ redirectUrl: `/yonetim/abonelik/test-odeme/${p.paymentId}` }),
};

/** BILLING_PROVIDER boşsa (ya da paytr anahtarları eksikse) ödeme kapalı (canlıda sahte sağlayıcı ücretsiz uzatma olurdu). */
export function getBillingProvider(): BillingProvider | null {
  const v = process.env.BILLING_PROVIDER;
  if (v === "fake") return fakeBilling;
  if (v === "paytr") { const k = paytrKeys(); return k ? paytrBilling(k) : null; }
  return null;
}
