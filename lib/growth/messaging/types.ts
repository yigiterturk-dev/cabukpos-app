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
export type NetgsmConfig = { base: string; username: string; password: string; header: string };
export type IletimerkeziConfig = { base: string; username: string; password: string; sender: string };

/** MARKETING_SMS_* değişkenlerini okur; eksikse Türkçe hata atar. */
export function smsConfig(env: NodeJS.ProcessEnv = process.env): SmsConfig {
  const base = env.MARKETING_SMS_API_BASE?.trim(), key = env.MARKETING_SMS_API_KEY?.trim(), from = env.MARKETING_SMS_FROM?.trim();
  if (!base || !key || !from) throw new Error("SMS sağlayıcısı yapılandırılmamış: MARKETING_SMS_API_BASE, MARKETING_SMS_API_KEY ve MARKETING_SMS_FROM gerekli.");
  return { base, key, from };
}

/** Netgsm REST v2 ayarları. */
export function netgsmConfig(env: NodeJS.ProcessEnv = process.env): NetgsmConfig {
  const username = env.NETGSM_USERNAME?.trim(), password = env.NETGSM_PASSWORD?.trim(), header = env.NETGSM_HEADER?.trim();
  if (!username || !password || !header) throw new Error("Netgsm yapılandırılmamış: NETGSM_USERNAME, NETGSM_PASSWORD ve NETGSM_HEADER gerekli.");
  return { base: (env.NETGSM_API_BASE?.trim() || "https://api.netgsm.com.tr").replace(/\/$/, ""), username, password, header };
}

/** İletimerkezi v1 ayarları. */
export function iletimerkeziConfig(env: NodeJS.ProcessEnv = process.env): IletimerkeziConfig {
  const username = env.ILETIMERKEZI_USERNAME?.trim(), password = env.ILETIMERKEZI_PASSWORD?.trim(), sender = env.ILETIMERKEZI_SENDER?.trim();
  if (!username || !password || !sender) throw new Error("İletimerkezi yapılandırılmamış: ILETIMERKEZI_USERNAME, ILETIMERKEZI_PASSWORD ve ILETIMERKEZI_SENDER gerekli.");
  return { base: (env.ILETIMERKEZI_API_BASE?.trim() || "https://api.iletimerkezi.com").replace(/\/$/, ""), username, password, sender };
}

/** TR numarasını sağlayıcıların beklediği 12 haneli 90... biçimine getirir. */
export function normalizeTrPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("90")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "90" + digits.slice(1);
  if (digits.length === 10 && digits.startsWith("5")) return "90" + digits;
  return digits;
}
