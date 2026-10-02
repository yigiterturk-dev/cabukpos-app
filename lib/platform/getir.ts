// lib/platform/getir.ts — Getir sandbox adaptörü: GETIR_ENABLED=1 ile açılır; kapalıyken ağa çıkmaz.
// Açıkken kabul/red GETIR_API_BASE + GETIR_API_KEY ister; eksikse Türkçe hata verir.
import { z } from "zod";
import type { IncomingOrder } from "@/lib/core/platform";
import type { PayIntent } from "@/lib/core/tab";
import { verifySignature } from "./mock";
import type { Conn, OrderSource } from "./types";

const kurus = z.number().int().min(0).max(100_000_000);
// Sandbox gövdesi: yalnız bilinen alanlar; başka biçim reddedilir.
const order = z.object({
  orderId: z.string().trim().min(1).max(120),
  customer: z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), phone: z.string().trim().min(6).max(20) }),
  deliveryAddress: z.string().trim().min(1).max(500),
  paymentMethod: z.enum(["CASH", "CREDIT_CARD", "MEAL_CARD"]).default("CREDIT_CARD"),
  note: z.string().max(300).nullable().default(null),
  products: z.array(z.object({ sku: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(120), price: kurus, quantity: z.number().int().min(1).max(1000), note: z.string().max(200).nullable().default(null) })).min(1).max(200),
});
const body = z.object({ orders: z.array(order).min(1).max(50) });

const payIntent: Record<z.infer<typeof order>["paymentMethod"], PayIntent> = { CASH: "nakit", CREDIT_CARD: "kart", MEAL_CARD: "yemek_karti" };

/** Sandbox gövdesini IncomingOrder'a çevirir; bilinmeyen biçimi Türkçe hatayla reddeder. */
export function parseSandboxPayload(json: unknown): IncomingOrder[] {
  const p = body.safeParse(json);
  if (!p.success) throw new Error("Getir sandbox gövdesi tanınmadı.");
  return p.data.orders.map((o) => ({
    externalId: o.orderId,
    customer: { name: `${o.customer.firstName} ${o.customer.lastName}`.trim(), phone: o.customer.phone },
    address: o.deliveryAddress,
    directions: null,
    note: o.note,
    payIntent: payIntent[o.paymentMethod],
    deadline: null,
    lines: o.products.map((l) => ({ code: l.sku, name: l.name, unitPrice: l.price, qtyMilli: l.quantity * 1000, note: l.note })),
  }));
}

function requireConfig() {
  const base = process.env.GETIR_API_BASE, key = process.env.GETIR_API_KEY;
  if (!base || !key) throw new Error("Getir entegrasyonu yapılandırılmamış: GETIR_API_BASE ve GETIR_API_KEY gerekli.");
  return { base, key };
}

export function createGetirSource(enabled: boolean): OrderSource {
  return {
    id: "getir",
    parseWebhook(raw, headers, conn) {
      if (!enabled) return { error: "Getir bağlantısı kapalı.", status: 400 };
      if (!verifySignature(conn.webhookSecret, raw, headers.get("x-getir-signature"))) return { error: "İmza geçersiz.", status: 401 };
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
      try { return parseSandboxPayload(json); } catch (e) { return { error: e instanceof Error ? e.message : "Biçim hatalı.", status: 400 }; }
    },
    async accept(conn: Conn, externalId: string, prepMin: number) {
      if (!enabled) throw new Error("Getir bağlantısı kapalı.");
      const { base, key } = requireConfig();
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/accept`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ prepMin }) });
      if (!res.ok) throw new Error(`Getir kabul hatası: HTTP ${res.status}`);
    },
    async reject(conn: Conn, externalId: string, reason: string) {
      if (!enabled) throw new Error("Getir bağlantısı kapalı.");
      const { base, key } = requireConfig();
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/reject`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error(`Getir red hatası: HTTP ${res.status}`);
    },
  };
}

export const getirSource = createGetirSource(process.env.GETIR_ENABLED === "1");
