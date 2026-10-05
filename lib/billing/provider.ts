// lib/billing/provider.ts — Ödeme sağlayıcı arayüzü. Gerçek sağlayıcı (PayTR/iyzico) = yeni dosya + webhook route → completePayment.
import type { BillingPeriod } from "@/lib/core/billing";
import { paytrBilling, paytrKeys } from "./paytr";

export type CheckoutInput = { paymentId: string; amount: number; period: BillingPeriod; tenantName: string; email: string; userIp: string; phone?: string; address?: string | null };
export interface BillingProvider {
  name: string;
  test: boolean;
  start(p: CheckoutInput): Promise<{ redirectUrl: string }>;
  /** #11: saklanan kart jetonuyla ücret çekme (otomatik yenileme). Desteklemeyen sağlayıcı tanımsız bırakır. */
  chargeStored?(cardToken: string, amount: number, paymentId: string): Promise<{ ok: boolean; error?: string }>;
}

export const fakeBilling: BillingProvider = {
  name: "fake",
  test: true,
  start: async (p) => ({ redirectUrl: `/yonetim/abonelik/test-odeme/${p.paymentId}` }),
  chargeStored: async () => ({ ok: true }), // yerel: ücretsiz uzatma (yalnız env BILLING_PROVIDER=fake ile)
};

/** BILLING_PROVIDER boşsa veya canlıda sahte/paytr anahtarları eksikse ödeme kapalıdır. */
export function getBillingProvider(): BillingProvider | null {
  const v = process.env.BILLING_PROVIDER;
  const production = process.env.NODE_ENV === "production" || process.env.LAUNCH_ENV === "production";
  if (v === "fake") return production ? null : fakeBilling;
  if (v === "paytr") { const k = paytrKeys(); return k ? paytrBilling(k) : null; }
  return null;
}
