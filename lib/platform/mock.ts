// lib/platform/mock.ts — Sahte platform: HMAC-SHA256 imzalı webhook (x-signature, hex), kabul/red ağa çıkmaz.
// MOCK_PLATFORM_FAIL=1 → kabul/red hata verir (bildirim hatası yolunu denemek için).
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { OrderSource } from "./types";

const kurus = z.number().int().min(0).max(100_000_000);
const order = z.object({
  externalId: z.string().trim().min(1).max(120),
  customer: z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().min(6).max(20) }),
  address: z.string().trim().min(1).max(500),
  directions: z.string().max(300).nullable().default(null),
  note: z.string().max(300).nullable().default(null),
  payIntent: z.enum(["nakit", "kart", "yemek_karti", "online"]).default("online"),
  deadline: z.iso.datetime({ offset: true }).nullable().default(null),
  lines: z.array(z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(120), unitPrice: kurus, qtyMilli: z.number().int().min(1).max(1_000_000), note: z.string().max(200).nullable().default(null) })).min(1).max(200),
});
const body = z.object({ orders: z.array(order).min(1).max(50) });

export const sign = (secret: string, raw: string) => createHmac("sha256", secret).update(raw).digest("hex");

export function verifySignature(secret: string, raw: string, sig: string | null): boolean {
  if (!sig || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  return timingSafeEqual(Buffer.from(sign(secret, raw), "hex"), Buffer.from(sig, "hex"));
}

const fail = async () => { if (process.env.MOCK_PLATFORM_FAIL === "1") throw new Error("sahte platform hatası"); };

export const mockSource: OrderSource = {
  id: "mock",
  parseWebhook(raw, headers, conn) {
    if (!verifySignature(conn.webhookSecret, raw, headers.get("x-signature"))) return { error: "İmza geçersiz.", status: 401 };
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
    const p = body.safeParse(json);
    if (!p.success) return { error: "Biçim hatalı.", status: 400 };
    return p.data.orders.map((o) => ({ ...o, customer: { ...o.customer }, raw: undefined }));
  },
  accept: fail,
  reject: fail,
};
