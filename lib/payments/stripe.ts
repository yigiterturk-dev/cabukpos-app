// Stripe adaptörü — SDK YOK, doğrudan REST + Web Crypto.
//
// NEDEN SDK'sız: stripe paketi Node-only ve ~1MB'ı aşar; burada ihtiyacımız olan iki
// uç nokta (checkout session oluştur + webhook imza doğrula) fetch ile karşılanıyor.
// Böylece sağlayıcı seçilmediğinde de bundle'a hiçbir şey girmez.
//
// İMZA DOĞRULAMA: Stripe-Signature başlığı `t=<ts>,v1=<hmac>` formatındadır ve
// HMAC-SHA256(`${t}.${rawBody}`, webhookSecret) ile eşleşmelidir. Karşılaştırma
// SABİT ZAMANLI yapılır (timing oracle bırakma). Ayrıca timestamp penceresi
// kontrol edilir → replay saldırısı engellenir.

import type { PlanId } from "@/lib/types";
import { PLANS } from "./plans";
import type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentProvider } from "./types";

const API = "https://api.stripe.com/v1";
const TOLERANCE_SECONDS = 5 * 60;

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createStripeProvider(secretKey: string, webhookSecret: string): PaymentProvider {
  return {
    name: "stripe",

    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      const plan = PLANS[req.planId];
      // Stripe tutarları en küçük birimde ister → TRY için kuruş.
      const unitAmount = Math.round(plan.priceTRY * 100);

      const body: Record<string, string> = {
        mode: "subscription",
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "try",
        "line_items[0][price_data][unit_amount]": String(unitAmount),
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": `Yanında POS — ${plan.label}`,
        // businessId/planId'yi metadata'ya YAZ: webhook'ta kimin ne aldığını
        // client'a güvenmeden buradan okuyacağız.
        "metadata[businessId]": req.businessId,
        "metadata[planId]": req.planId,
        "subscription_data[metadata][businessId]": req.businessId,
        "subscription_data[metadata][planId]": req.planId,
      };
      if (req.customerEmail) body.customer_email = req.customerEmail;

      const res = await fetch(`${API}/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form(body),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[stripe] checkout oluşturulamadı:", res.status, detail.slice(0, 400));
        return { ok: false, error: "Ödeme sayfası açılamadı. Lütfen tekrar deneyin." };
      }

      const json = (await res.json()) as { url?: string };
      if (!json.url) return { ok: false, error: "Ödeme sayfası açılamadı." };
      return { ok: true, redirectUrl: json.url };
    },

    async parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent> {
      if (!signature) throw new Error("imza başlığı yok");

      const parts = Object.fromEntries(
        signature.split(",").map((kv) => {
          const i = kv.indexOf("=");
          return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
        })
      ) as { t?: string; v1?: string };

      if (!parts.t || !parts.v1) throw new Error("imza başlığı bozuk");

      const ts = Number(parts.t);
      if (!Number.isFinite(ts)) throw new Error("imza zaman damgası geçersiz");
      if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
        throw new Error("imza zaman damgası penceresi dışında (replay?)");
      }

      const expected = await hmacSha256Hex(webhookSecret, `${parts.t}.${rawBody}`);
      if (!timingSafeEqual(expected, parts.v1)) throw new Error("imza doğrulanamadı");

      // İmza doğrulandı ama gövdenin ŞEKLİ hâlâ dış veri. Bozuk/eksik JSON'da
      // ham hata mesajı sızdırmak yerine anlaşılır bir hata fırlat; çağıran uç
      // nokta bunu 400'e çevirir.
      let evt: { id?: unknown; type?: unknown; data?: { object?: unknown } };
      try {
        evt = JSON.parse(rawBody);
      } catch {
        throw new Error("webhook gövdesi geçerli JSON değil");
      }
      if (typeof evt?.id !== "string" || typeof evt?.type !== "string") {
        throw new Error("webhook gövdesinde id/type yok");
      }
      const obj = (evt.data?.object ?? {}) as Record<string, unknown>;
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      const businessId = meta.businessId;
      const planId = meta.planId as PlanId | undefined;

      if (
        (evt.type === "checkout.session.completed" || evt.type === "invoice.paid") &&
        businessId &&
        planId &&
        planId in PLANS
      ) {
        const amountRaw = (obj.amount_total ?? obj.amount_paid ?? 0) as number;
        return {
          type: "subscription_paid",
          businessId,
          planId,
          eventId: evt.id as string,
          amount: amountRaw / 100,
          currency: String(obj.currency ?? "try").toLowerCase(),
        };
      }

      if (evt.type === "customer.subscription.deleted" && businessId) {
        return { type: "subscription_cancelled", businessId, eventId: evt.id as string };
      }

      return { type: "ignored", eventId: evt.id as string };
    },
  };
}
