// lib/billing/provider.ts — Ödeme sağlayıcı arayüzü. Gerçek sağlayıcı (PayTR/iyzico) = yeni dosya + webhook route → completePayment.
import type { BillingPeriod } from "@/lib/core/billing";

export type CheckoutInput = { paymentId: string; amount: number; period: BillingPeriod; tenantName: string; email: string };
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

/** BILLING_PROVIDER boşsa ödeme kapalı (canlıda sahte sağlayıcı ücretsiz uzatma olurdu). */
export function getBillingProvider(): BillingProvider | null {
  return process.env.BILLING_PROVIDER === "fake" ? fakeBilling : null;
}
