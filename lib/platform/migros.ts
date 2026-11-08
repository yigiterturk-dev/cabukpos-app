// lib/platform/migros.ts — Migros Yemek sandbox adaptörü: MIGROS_ENABLED=1 ile açılır; kapalıyken ağa çıkmaz.
// Getir/YS/Trendyol ile aynı sözleşme: imzalı webhook (x-migros-signature, opsiyonel -timestamp), kabul/red/durum/katalog.
// Canlı uç adları entegratör onayıyla doğrulanır (#28 deseni).
import { z } from "zod";
import type { IncomingOrder } from "@/lib/core/platform";
import type { PayIntent } from "@/lib/core/tab";
import { verifySignature } from "./mock";
import { platformApi } from "./credentials";
import type { Conn, OrderSource, PlatformOrderStatus } from "./types";

const kurus = z.number().int().min(0).max(100_000_000);
const order = z.object({
  orderRef: z.string().trim().min(1).max(120),
  client: z.object({ title: z.string().trim().min(1).max(120), gsm: z.string().trim().min(6).max(20) }),
  addressLine: z.string().trim().min(1).max(500),
  payment: z.enum(["nakit", "kart", "yemek_karti", "online"]).default("online"),
  remark: z.string().max(300).nullable().default(null),
  items: z.array(z.object({ sku: z.string().trim().min(1).max(60), title: z.string().trim().min(1).max(120), unitPrice: kurus, qtyMilli: z.number().int().min(1).max(1_000_000), note: z.string().max(200).nullable().default(null) })).min(1).max(200),
});
const body = z.object({ orders: z.array(order).min(1).max(50) });

const payIntent: Record<z.infer<typeof order>["payment"], PayIntent> = { nakit: "nakit", kart: "kart", yemek_karti: "yemek_karti", online: "online" };

export function parseSandboxPayload(json: unknown): IncomingOrder[] {
  const p = body.safeParse(json);
  if (!p.success) throw new Error("Migros sandbox gövdesi tanınmadı.");
  return p.data.orders.map((o) => ({
    externalId: o.orderRef,
    customer: { name: o.client.title, phone: o.client.gsm },
    address: o.addressLine,
    directions: null,
    note: o.remark,
    payIntent: payIntent[o.payment],
    deadline: null,
    lines: o.items.map((l) => ({ code: l.sku, name: l.title, unitPrice: l.unitPrice, qtyMilli: l.qtyMilli, note: l.note })),
  }));
}

function requireConfig(conn: Conn) {
  return platformApi(conn, process.env.MIGROS_API_BASE, process.env.MIGROS_API_KEY, "Migros");
}

export function createMigrosSource(enabled: boolean): OrderSource {
  return {
    id: "migros",
    parseWebhook(raw, headers, conn) {
      if (!enabled) return { error: "Migros bağlantısı kapalı.", status: 400 };
      if (!verifySignature(conn.webhookSecret, raw, headers.get("x-migros-signature"), headers.get("x-migros-signature-timestamp"))) return { error: "İmza geçersiz.", status: 401 };
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
      try { return parseSandboxPayload(json); } catch (e) { return { error: e instanceof Error ? e.message : "Biçim hatalı.", status: 400 }; }
    },
    async accept(conn: Conn, externalId: string, prepMin: number) {
      if (!enabled) throw new Error("Migros bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/accept`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ prepMin }) });
      if (!res.ok) throw new Error(`Migros kabul hatası: HTTP ${res.status}`);
    },
    async reject(conn: Conn, externalId: string, reason: string) {
      if (!enabled) throw new Error("Migros bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/reject`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error(`Migros red hatası: HTTP ${res.status}`);
    },
    async pushStatus(conn: Conn, externalId: string, status: PlatformOrderStatus) {
      if (!enabled) throw new Error("Migros bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/status`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(`Migros durum hatası: HTTP ${res.status}`);
    },
    async pushCatalog(conn: Conn, items) {
      if (!enabled) return { error: "Migros bağlantısı kapalı." };
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/stores/${encodeURIComponent(conn.storeId)}/catalog`, { method: "PUT", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ items }), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Migros katalog hatası: HTTP ${res.status}`);
      const parsed = z.object({ ok: z.number().int().min(0), failed: z.number().int().min(0) }).safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("Migros katalog cevabı tanınmadı.");
      return parsed.data;
    },
  };
}

export const migrosSource = createMigrosSource(process.env.MIGROS_ENABLED === "1");
