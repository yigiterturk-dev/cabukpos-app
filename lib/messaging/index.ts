// Mesaj sağlayıcısı çözümü — env ile seçilir. Kurulmamışsa null döner ve
// otomatik hatırlatma AKIŞI ÇALIŞMAZ (sessizce "gönderildi" yazmaz).
//
// MESSAGE_PROVIDER=twilio + TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
//   + TWILIO_SMS_FROM ve/veya TWILIO_WHATSAPP_FROM

import { createTwilioProvider } from "./twilio";
import type { MessageProvider } from "./types";

export * from "./phone";
export * from "./template";
export type { MessageProvider, OutboundMessage, SendResult } from "./types";

let cached: MessageProvider | null | undefined;

export function getMessageProvider(): MessageProvider | null {
  if (cached !== undefined) return cached;

  const which = (process.env.MESSAGE_PROVIDER ?? "none").trim().toLowerCase();
  if (which === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const sms = process.env.TWILIO_SMS_FROM?.trim();
    const wa = process.env.TWILIO_WHATSAPP_FROM?.trim();
    if (!sid || !token || (!sms && !wa)) {
      console.warn(
        "[messaging] MESSAGE_PROVIDER=twilio ama SID/TOKEN veya gönderici numara eksik → mesajlaşma kapalı."
      );
      cached = null;
      return cached;
    }
    cached = createTwilioProvider(sid, token, sms, wa);
    return cached;
  }

  cached = null;
  return cached;
}

export function messagingEnabled(): boolean {
  return getMessageProvider() !== null;
}
