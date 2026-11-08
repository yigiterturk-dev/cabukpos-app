// lib/growth/messaging/netgsm.ts — Netgsm REST v2 SMS sürücüsü.
// Kimlik Basic auth ile gider; telefon yalnız istek gövdesinde kalır, log/audit'e yazılmaz.
import { z } from "zod";
import { netgsmConfig, normalizeTrPhone, type MessagingProvider, type MessagingSendResult, type NetgsmConfig } from "./types";

const response = z.object({
  code: z.union([z.string(), z.number()]).transform(String),
  jobid: z.union([z.string(), z.number()]).transform(String).optional(),
  description: z.string().optional(),
});

export function createNetgsmProvider(enabled: boolean, config: NetgsmConfig | null, fetchImpl: typeof fetch = fetch): MessagingProvider {
  return {
    id: "netgsm",
    async send({ body, targets }): Promise<MessagingSendResult[]> {
      if (!enabled) throw new Error("Pazarlama gönderimi kapalı: MARKETING_SMS_ENABLED=1 gerekli.");
      const cfg = config ?? netgsmConfig();
      if (!targets.length) return [];
      const auth = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
      const res = await fetchImpl(`${cfg.base.replace(/\/$/, "")}/sms/rest/v2/send`, {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
        body: JSON.stringify({
          msgheader: cfg.header,
          messages: targets.map((t) => ({ msg: body, no: normalizeTrPhone(t.phone) })),
          encoding: "TR",
          iysfilter: "0",
          appname: "CabukPOS",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Netgsm sağlayıcı hatası: HTTP ${res.status}`);
      const parsed = response.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("Netgsm cevabı tanınmadı.");
      if (parsed.data.code !== "00") {
        const error = parsed.data.description ?? `Netgsm kodu: ${parsed.data.code}`;
        return targets.map((t) => ({ recipientRef: t.recipientRef, externalId: null, error }));
      }
      const externalId = parsed.data.jobid ?? "netgsm-ok";
      return targets.map((t) => ({ recipientRef: t.recipientRef, externalId }));
    },
  };
}
