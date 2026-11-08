// lib/growth/messaging/iletimerkezi.ts — İletimerkezi v1 SMS sürücüsü (JSON).
// Kimlik istek gövdesinde gider; telefon yalnız istek gövdesinde kalır, log/audit'e yazılmaz.
import { z } from "zod";
import { iletimerkeziConfig, normalizeTrPhone, type MessagingProvider, type MessagingSendResult, type IletimerkeziConfig } from "./types";

const response = z.object({
  response: z.object({
    status: z.object({
      code: z.union([z.string(), z.number()]).transform(String),
      message: z.string().optional(),
    }),
    order: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional(),
  }),
});

export function createIletimerkeziProvider(enabled: boolean, config: IletimerkeziConfig | null, fetchImpl: typeof fetch = fetch): MessagingProvider {
  return {
    id: "iletimerkezi",
    async send({ body, targets }): Promise<MessagingSendResult[]> {
      if (!enabled) throw new Error("Pazarlama gönderimi kapalı: MARKETING_SMS_ENABLED=1 gerekli.");
      const cfg = config ?? iletimerkeziConfig();
      if (!targets.length) return [];
      const res = await fetchImpl(`${cfg.base.replace(/\/$/, "")}/v1/send-sms/json`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request: {
            authentication: { username: cfg.username, password: cfg.password },
            message: { sender: cfg.sender, text: body },
            receivers: { receiver: targets.map((t) => ({ number: normalizeTrPhone(t.phone) })) },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`İletimerkezi sağlayıcı hatası: HTTP ${res.status}`);
      const parsed = response.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("İletimerkezi cevabı tanınmadı.");
      const status = parsed.data.response.status;
      if (status.code !== "200") {
        const error = status.message ?? `İletimerkezi kodu: ${status.code}`;
        return targets.map((t) => ({ recipientRef: t.recipientRef, externalId: null, error }));
      }
      const externalId = parsed.data.response.order?.id ? String(parsed.data.response.order.id) : "iletimerkezi-ok";
      return targets.map((t) => ({ recipientRef: t.recipientRef, externalId }));
    },
  };
}
