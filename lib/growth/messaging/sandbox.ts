// lib/growth/messaging/sandbox.ts — SMS/WhatsApp HTTP sürücüsü: MARKETING_SMS_ENABLED=1 ile açılır; kapalıyken ağa çıkmaz.
// Canlı anahtar insan işi; sözleşme: POST {base}/messages {from, body, messages:[{to, ref}]} → {messages:[{ref, id} | {ref, error}]}.
import { z } from "zod";
import { smsConfig, type MessagingProvider, type MessagingSendResult, type SmsConfig } from "./types";

const response = z.object({
  messages: z.array(z.object({
    ref: z.string().min(1).max(200),
    id: z.string().min(1).max(200).nullable().optional(),
    error: z.string().max(200).nullable().optional(),
  })).min(1).max(500),
});

export function createSandboxSmsProvider(enabled: boolean, config: SmsConfig | null, fetchImpl: typeof fetch = fetch): MessagingProvider {
  return {
    id: "sms",
    async send({ body, targets }): Promise<MessagingSendResult[]> {
      if (!enabled) throw new Error("Pazarlama gönderimi kapalı: MARKETING_SMS_ENABLED=1 gerekli.");
      const cfg = config ?? smsConfig();
      if (!targets.length) return [];
      const res = await fetchImpl(`${cfg.base}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: cfg.from, body, messages: targets.map((t) => ({ to: t.phone, ref: t.recipientRef })) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`SMS sağlayıcı hatası: HTTP ${res.status}`);
      const parsed = response.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("SMS sağlayıcı cevabı tanınmadı.");
      const byRef = new Map(parsed.data.messages.map((m) => [m.ref, m]));
      return targets.map((t): MessagingSendResult => {
        const m = byRef.get(t.recipientRef);
        if (!m) return { recipientRef: t.recipientRef, externalId: null, error: "sağlayıcı cevabında yok" };
        if (m.error) return { recipientRef: t.recipientRef, externalId: null, error: m.error };
        return { recipientRef: t.recipientRef, externalId: m.id ?? null, error: m.id ? undefined : "sağlayıcı mesaj kimliği vermedi" };
      });
    },
  };
}

export const sandboxSmsProvider = createSandboxSmsProvider(process.env.MARKETING_SMS_ENABLED === "1", null);
