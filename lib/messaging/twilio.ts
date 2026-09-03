// Twilio adaptörü — SMS ve WhatsApp. SDK yok, REST + Basic auth.
// WhatsApp için numaralar "whatsapp:+90..." önekiyle gider (Twilio kuralı).

import type { CampaignChannel } from "@/lib/types";
import type { MessageProvider, OutboundMessage, SendResult } from "./types";

export function createTwilioProvider(
  accountSid: string,
  authToken: string,
  fromSms: string | undefined,
  fromWhatsApp: string | undefined
): MessageProvider {
  return {
    name: "twilio",

    supports(channel: CampaignChannel): boolean {
      if (channel === "sms") return !!fromSms;
      if (channel === "whatsapp") return !!fromWhatsApp;
      return false;
    },

    async send(msg: OutboundMessage): Promise<SendResult> {
      const isWa = msg.channel === "whatsapp";
      const from = isWa ? fromWhatsApp : fromSms;
      if (!from) {
        return { ok: false, error: `${msg.channel} için gönderici numara tanımlı değil`, retryable: false };
      }

      const body = new URLSearchParams({
        To: isWa ? `whatsapp:${msg.to}` : msg.to,
        From: isWa ? `whatsapp:${from}` : from,
        Body: msg.text,
      });

      let res: Response;
      try {
        res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          }
        );
      } catch (e) {
        // Ağ hatası → tekrar denenebilir.
        return { ok: false, error: e instanceof Error ? e.message : "ağ hatası", retryable: true };
      }

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { sid?: string };
        return { ok: true, providerMessageId: json.sid };
      }

      const detail = await res.text().catch(() => "");
      // 4xx = bizim hatamız (numara/şablon/bakiye) → tekrar denemek düzeltmez.
      // 5xx / 429 = geçici → tekrar denenebilir.
      const retryable = res.status >= 500 || res.status === 429;
      return {
        ok: false,
        error: `twilio ${res.status}: ${detail.slice(0, 200)}`,
        retryable,
      };
    },
  };
}
