// Ödeme sağlayıcısı webhook'u — planı YALNIZCA buradan yükseltiriz.
//
// GÜVENLİK KURALLARI:
//  1) Gövde HAM okunur (req.text()); imza ham bayt üzerinden hesaplanır, JSON.parse'tan
//     geçmiş yeniden serileştirilmiş gövde İMZAYI BOZAR.
//  2) İmza doğrulanamazsa 400 döner ve HİÇBİR ŞEY yazılmaz. "Muhtemelen bizdendir" yok.
//  3) businessId/planId client'tan DEĞİL, sağlayıcının imzaladığı metadata'dan gelir.
//  4) Idempotency: aynı eventId iki kez gelirse (sağlayıcılar tekrar dener) ikinci sefer
//     yazma yapılmaz — çift fatura/çift yükseltme olmaz.
//  5) Node runtime: imza HMAC'i Web Crypto ile yapılır ama db (neon-http) burada çalışır.

import { NextResponse } from "next/server";

import { changePlan } from "@/lib/data";
import { getPaymentProvider } from "@/lib/payments";
import { rateLimited, resetRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const provider = getPaymentProvider();
  if (!provider) {
    // Ödeme kurulmamışken bu uç nokta yüzey oluşturmasın.
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }

  const raw = await req.text();
  const signature =
    req.headers.get("stripe-signature") ?? req.headers.get("x-payment-signature");

  let event;
  try {
    event = await provider.parseWebhook(raw, signature);
  } catch (e) {
    console.warn("[webhook] imza doğrulanamadı:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "ignored") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Idempotency: eventId'yi rate-limit sayacıyla "bir kez" kilidi olarak kullanıyoruz.
  // rl_hit ilk çağrıda false (geç), ikinci çağrıda true (engelle) döner → tekrarlar elenir.
  const lockKey = `webhook:evt:${event.eventId}`;
  const seen = await rateLimited(lockKey, {
    windowMs: 24 * 60 * 60 * 1000,
    max: 1,
  });
  if (seen) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    if (event.type === "subscription_paid") {
      // paid=true → fatura "odendi" yazılır. Bu bayrak SADECE burada true olur.
      await changePlan(event.businessId, event.planId, true);
      console.info(
        `[webhook] ödeme alındı: business=${event.businessId} plan=${event.planId} ` +
          `tutar=${event.amount} ${event.currency}`
      );
    } else if (event.type === "subscription_cancelled") {
      // İptal → en alt plana düş (veri silinmez, yalnız plan iner).
      await changePlan(event.businessId, "baslangic", false);
      console.info(`[webhook] abonelik iptal: business=${event.businessId}`);
    }
  } catch (e) {
    // KİLİDİ BIRAK: yazma başarısızken kilit dursaydı, sağlayıcının tekrar denemesi
    // "duplicate" sayılıp atlanır ve ALINAN ÖDEME hiç işlenmezdi. Önce kilidi aç,
    // sonra 500 dön ki tekrar deneme gerçekten çalışsın.
    await resetRateLimit(lockKey).catch(() => {});
    console.error("[webhook] işlenemedi:", e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
