import type { PlanId } from "@/lib/types";

export type CheckoutRequest = {
  businessId: string;
  planId: PlanId;
  /** Ödeme bitince dönülecek mutlak URL'ler. */
  successUrl: string;
  cancelUrl: string;
  /** Makbuz/fatura için; sağlayıcıya iletilir. */
  customerEmail?: string;
};

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string; unconfigured?: boolean };

/** Sağlayıcıdan gelen, doğrulanmış ödeme olayı. */
export type PaymentEvent =
  | {
      type: "subscription_paid";
      businessId: string;
      planId: PlanId;
      /** Sağlayıcının olay kimliği — idempotency için. */
      eventId: string;
      amount: number;
      currency: string;
    }
  | { type: "subscription_cancelled"; businessId: string; eventId: string }
  | { type: "ignored"; eventId: string };

export interface PaymentProvider {
  readonly name: string;
  /** Ödeme sayfasına yönlendirme oturumu açar. */
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /**
   * Webhook gövdesini İMZASIYLA doğrular ve olaya çevirir.
   * İmza geçersizse hata fırlatır — asla "geçerli" varsayma.
   */
  parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent>;
}
