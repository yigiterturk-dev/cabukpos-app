// lib/growth/messaging/types.ts — Pazarlama mesajlaşma sağlayıcı arayüzü (sunucu).
// Gerçek SMS/WhatsApp hesabı geldiğinde sürücü buraya eklenir; telefon yalnız sunucuda kalır.
export type MessagingTarget = { recipientRef: string; phone: string };
export type MessagingSendResult = { recipientRef: string; externalId: string | null; error?: string };

export interface MessagingProvider {
  id: string;
  /** Onaylı kampanyanın bir sayfasını gönderir; sonuçlar girdi sırasıyla döner. Gönderen kimliği sağlayıcı config'inden gelir. */
  send(input: { body: string; targets: MessagingTarget[] }): Promise<MessagingSendResult[]>;
}

export type SmsConfig = { base: string; key: string; from: string };

/** MARKETING_SMS_* değişkenlerini okur; eksikse Türkçe hata atar. */
export function smsConfig(env: NodeJS.ProcessEnv = process.env): SmsConfig {
  const base = env.MARKETING_SMS_API_BASE?.trim(), key = env.MARKETING_SMS_API_KEY?.trim(), from = env.MARKETING_SMS_FROM?.trim();
  if (!base || !key || !from) throw new Error("SMS sağlayıcısı yapılandırılmamış: MARKETING_SMS_API_BASE, MARKETING_SMS_API_KEY ve MARKETING_SMS_FROM gerekli.");
  return { base, key, from };
}
