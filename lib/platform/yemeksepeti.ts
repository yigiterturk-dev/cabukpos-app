// lib/platform/yemeksepeti.ts — Yemeksepeti sandbox adaptörü: YEMEKSEPETI_ENABLED=1 ile açılır; kapalıyken ağa çıkmaz.
// Açıkken kabul/red YEMEKSEPETI_API_BASE + YEMEKSEPETI_API_KEY ister; eksikse Türkçe hata verir.
import { z } from "zod";
import type { IncomingOrder } from "@/lib/core/platform";
import type { PayIntent } from "@/lib/core/tab";
import { verifySignature } from "./mock";
import { platformApi } from "./credentials";
import type { Conn, OrderSource, PlatformOrderStatus } from "./types";

const kurus = z.number().int().min(0).max(100_000_000);
// Sandbox gövdesi (snake_case): yalnız bilinen alanlar; başka biçim reddedilir.
const order = z.object({
  order_id: z.string().trim().min(1).max(120),
  client: z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().min(6).max(20) }),
  address_text: z.string().trim().min(1).max(500),
  payment_type: z.enum(["cash", "card", "ticket"]).default("card"),
  comment: z.string().max(300).nullable().default(null),
  items: z.array(z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(120), unit_price: kurus, qty: z.number().int().min(1).max(1000), note: z.string().max(200).nullable().default(null) })).min(1).max(200),
});
const body = z.object({ orders: z.array(order).min(1).max(50) });

const payIntent: Record<z.infer<typeof order>["payment_type"], PayIntent> = { cash: "nakit", card: "kart", ticket: "yemek_karti" };

/** Sandbox gövdesini IncomingOrder'a çevirir; bilinmeyen biçimi Türkçe hatayla reddeder. */
export function parseSandboxPayload(json: unknown): IncomingOrder[] {
  const p = body.safeParse(json);
  if (!p.success) throw new Error("Yemeksepeti sandbox gövdesi tanınmadı.");
  return p.data.orders.map((o) => ({
    externalId: o.order_id,
    customer: { ...o.client },
    address: o.address_text,
    directions: null,
    note: o.comment,
    payIntent: payIntent[o.payment_type],
    deadline: null,
    lines: o.items.map((l) => ({ code: l.code, name: l.name, unitPrice: l.unit_price, qtyMilli: l.qty * 1000, note: l.note })),
  }));
}

function requireConfig(conn: Conn) {
  return platformApi(conn, process.env.YEMEKSEPETI_API_BASE, process.env.YEMEKSEPETI_API_KEY, "Yemeksepeti");
}

export function createYemeksepetiSource(enabled: boolean): OrderSource {
  return {
    id: "yemeksepeti",
    parseWebhook(raw, headers, conn) {
      if (!enabled) return { error: "Yemeksepeti bağlantısı kapalı.", status: 400 };
      if (!verifySignature(conn.webhookSecret, raw, headers.get("x-ys-signature"), headers.get("x-ys-signature-timestamp"))) return { error: "İmza geçersiz.", status: 401 };
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
      try { return parseSandboxPayload(json); } catch (e) { return { error: e instanceof Error ? e.message : "Biçim hatalı.", status: 400 }; }
    },
    async accept(conn: Conn, externalId: string, prepMin: number) {
      if (!enabled) throw new Error("Yemeksepeti bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/accept`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ prepMin }) });
      if (!res.ok) throw new Error(`Yemeksepeti kabul hatası: HTTP ${res.status}`);
    },
    async reject(conn: Conn, externalId: string, reason: string) {
      if (!enabled) throw new Error("Yemeksepeti bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/reject`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error(`Yemeksepeti red hatası: HTTP ${res.status}`);
    },
    // Durum geri bildirimi (M6 kalanı): kurye aldı / teslim / iptal.
    async pushStatus(conn: Conn, externalId: string, status: PlatformOrderStatus) {
      if (!enabled) throw new Error("Yemeksepeti bağlantısı kapalı.");
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/orders/${encodeURIComponent(externalId)}/status`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(`Yemeksepeti durum hatası: HTTP ${res.status}`);
    },
    // Menü/fiyat/stok geri push'u (#29): eşlenmiş ürünleri sandbox'a yazar; hedef biçim {ok, failed}.
    async pushCatalog(conn: Conn, items) {
      if (!enabled) return { error: "Yemeksepeti bağlantısı kapalı." };
      const { base, key } = requireConfig(conn);
      const res = await fetch(`${base}/stores/${encodeURIComponent(conn.storeId)}/catalog`, { method: "PUT", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ items }), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Yemeksepeti katalog hatası: HTTP ${res.status}`);
      const parsed = z.object({ ok: z.number().int().min(0), failed: z.number().int().min(0) }).safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("Yemeksepeti katalog cevabı tanınmadı.");
      return parsed.data;
    },
  };
}

export const yemeksepetiSource = createYemeksepetiSource(process.env.YEMEKSEPETI_ENABLED === "1");
