// Sağlayıcı çözümü — env ile seçilir, hiçbir sağlayıcı yoksa "kurulmamış" döner.
//
// PAYMENT_PROVIDER=stripe  + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
// (boş/eksikse ödeme akışı KAPALI kalır; ürün çalışmaya devam eder, plan yükseltme
//  "ödeme kurulmadı" der ve ÜCRETLİ PLANA GEÇİRMEZ.)

import { createStripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export * from "./plans";
export type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentProvider } from "./types";

let cached: PaymentProvider | null | undefined;

export function getPaymentProvider(): PaymentProvider | null {
  if (cached !== undefined) return cached;

  const which = (process.env.PAYMENT_PROVIDER ?? "none").trim().toLowerCase();
  if (which === "stripe") {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    const hook = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!key || !hook) {
      console.warn(
        "[payments] PAYMENT_PROVIDER=stripe ama STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET eksik → ödeme kapalı."
      );
      cached = null;
      return cached;
    }
    cached = createStripeProvider(key, hook);
    return cached;
  }

  cached = null;
  return cached;
}

/** Ödeme rayı kurulu mu — UI bunu "yakında" rozetini göstermek için kullanır. */
export function paymentsEnabled(): boolean {
  return getPaymentProvider() !== null;
}
