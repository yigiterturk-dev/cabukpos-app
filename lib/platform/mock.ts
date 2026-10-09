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
/** Timestamp'li imza (growth deseni): HMAC(secret, "<unix-sn>.<gövde>") — oynatma (replay) koruması. */
export const signAt = (secret: string, raw: string, ts: number) => createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");

const SKEW_SECONDS = 5 * 60;

/** İmza doğrulama. `timestamp` verildiyse timestamp'li biçim zorunlu (eski/yeniden oynatılmış imzalar reddedilir);
 *  verilmediyse eski biçim (yalnız gövde) kabul — geriye uyum, platformlar yenisine geçerken kırılmasın. */
export function verifySignature(secret: string, raw: string, sig: string | null, timestamp?: string | null, nowMs = Date.now()): boolean {
  if (!sig || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  if (timestamp === undefined || timestamp === null) return timingSafeEqual(Buffer.from(sign(secret, raw), "hex"), Buffer.from(sig, "hex"));
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(Math.floor(nowMs / 1000) - ts) > SKEW_SECONDS) return false;
  return timingSafeEqual(Buffer.from(signAt(secret, raw, ts), "hex"), Buffer.from(sig, "hex"));
}

const fail = async () => { if (process.env.MOCK_PLATFORM_FAIL === "1") throw new Error("sahte platform hatası"); };

export const mockSource: OrderSource = {
  id: "mock",
  parseWebhook(raw, headers, conn) {
    if (!verifySignature(conn.webhookSecret, raw, headers.get("x-signature"), headers.get("x-signature-timestamp"))) return { error: "İmza geçersiz.", status: 401 };
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
    const p = body.safeParse(json);
    if (!p.success) return { error: "Biçim hatalı.", status: 400 };
    return p.data.orders.map((o) => ({ ...o, customer: { ...o.customer }, raw: undefined }));
  },
  accept: fail,
  reject: fail,
  // Durum geri bildirimi: sahte platformda ağ yok; MOCK_PLATFORM_FAIL=1 hata yolunu dener.
  pushStatus: fail,
  // Geri push (#29): sahte platformda ağ yok; MOCK_PLATFORM_FAIL=1 hata yolunu dener.
  async pushCatalog(_conn, items) {
    if (process.env.MOCK_PLATFORM_FAIL === "1") return { error: "sahte platform hatası" };
    return { ok: items.length, failed: 0 };
  },
};
