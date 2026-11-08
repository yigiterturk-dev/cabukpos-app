// lib/platform/tiklagelsin.ts — Tıkla Gelsin sandbox adaptörü: TIKLAGELSIN_ENABLED=1 ile açılır; kapalıyken ağa çıkmaz.
// Aile sözleşmesi: imzalı webhook (x-tiklagelsin-signature, opsiyonel -timestamp), kabul/red/durum/katalog.
// Canlı uç adları entegratör onayıyla doğrulanır (#28 deseni).
import { z } from "zod";
import type { IncomingOrder } from "@/lib/core/platform";
import type { PayIntent } from "@/lib/core/tab";
import { verifySignature } from "./mock";
import { platformApi } from "./credentials";
import type { Conn, OrderSource, PlatformOrderStatus } from "./types";

const kurus = z.number().int().min(0).max(100_000_000);
const order = z.object({
  id: z.string().trim().min(1).max(120),
  customer: z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().min(6).max(20) }),
  address: z.string().trim().min(1).max(500),
  paymentMethod: z.enum(["cash", "credit_card", "meals_card", "online"]).default("online"),
  note: z.string().max(300).nullable().default(null),
  basket: z.array(z.object({ productCode: z.string().trim().min(1).max(60), productName: z.string().trim().min(1).max(120), price: kurus, quantity: z.number().int().min(1).max(1_000), note: z.string().max(200).nullable().default(null) })).min(1).max(200),
});
const body = z.object({ orders: z.array(order).min(1).max(50) });

const payIntent: Record<z.infer<typeof order>["paymentMethod"], PayIntent> = { cash: "nakit", credit_card: "kart", meals_card: "yemek_karti", online: "online" };

export function parseSandboxPayload(json: unknown): IncomingOrder[] {
  const p = body.safeParse(json);
  if (!p.success) throw new Error("Tıkla Gelsin sandbox gövdesi tanınmadı.");
  return p.data.orders.map((o) => ({
    externalId: o.id,
    customer: { name: o.customer.name, phone: o.customer.phone },
    address: o.address,
    directions: null,
    note: o.note,
    payIntent: payIntent[o.paymentMethod],
    deadline: null,
    lines: o.basket.map((l) => ({ code: l.productCode, name: l.productName, unitPrice: l.price, qtyMilli: l.quantity * 1000, note: l.note })),
  }));
}

function requireConfig(conn: Conn) {
  return platformApi(conn, process.env.TIKLAGELSIN_API_BASE, process.env.TIKLAGELSIN_API_KEY, "Tıkla Gelsin");
}

export function createTiklaGelsinSource(enabled: boolean): OrderSource {
  return {
    id: "tiklagelsin",
    parseWebhook(raw, headers, conn) {
      if (!enabled) return { error: "Tıkla Gelsin bağlantısı kapalı.", status: 400 };
      if (!verifySignature(conn.webhookSecret, raw, headers.get("x-tiklagelsin-signature"), headers.get("x-tiklagelsin-signature-timestamp"))) return { error: "İmza geçersiz.", status: 401 };
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
      try { return parseSandboxPayload(json); } catch (e) { return { error: e instanceof Error ? e.message : "Biçim hatalı.", status: 400 }; }
    },
    async accept(conn: Conn, externalId: string, prepMin: number) {
      if (!enabled) throw new Error("Tıkla Gelsin bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/accept`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ prepMin }) });
      if (!res.ok) throw new Error(`Tıkla Gelsin kabul hatası: HTTP ${res.status}`);
    },
    async reject(conn: Conn, externalId: string, reason: string) {
      if (!enabled) throw new Error("Tıkla Gelsin bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/reject`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error(`Tıkla Gelsin red hatası: HTTP ${res.status}`);
    },
    async pushStatus(conn: Conn, externalId: string, status: PlatformOrderStatus) {
      if (!enabled) throw new Error("Tıkla Gelsin bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/status`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(`Tıkla Gelsin durum hatası: HTTP ${res.status}`);
    },
    async pushCatalog(conn: Conn, items) {
      if (!enabled) return { error: "Tıkla Gelsin bağlantısı kapalı." };
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/stores/${encodeURIComponent(conn.storeId)}/catalog`, { method: "PUT", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ items }), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Tıkla Gelsin katalog hatası: HTTP ${res.status}`);
      const parsed = z.object({ ok: z.number().int().min(0), failed: z.number().int().min(0) }).safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("Tıkla Gelsin katalog cevabı tanınmadı.");
      return parsed.data;
    },
  };
}

export const tiklaGelsinSource = createTiklaGelsinSource(process.env.TIKLAGELSIN_ENABLED === "1");
