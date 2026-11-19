// lib/platform/yemeksepeti-partner.ts — Yemeksepeti Partner API v2 (Delivery Hero) adaptörü.
// Resmî sözleşme: OAuth2 client credentials, tek siparişlik webhook, PUT /v2/chains/{chain}/orders/{order},
// PUT /v2/chains/{chain}/vendors/{vendor}/catalog. Sandbox: sandbox.partner.deliveryhero.io
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { IncomingOrder } from "@/lib/core/platform";
import type { Kurus } from "@/lib/core/money";
import type { PayIntent } from "@/lib/core/tab";
import { readConnectionCredentials, type PartnerCredentials } from "./credentials";
import type { Conn, OrderSource, PlatformOrderStatus, PlatformWebhookEvent } from "./types";

const PROD_BASE = "https://yemeksepeti.partner.deliveryhero.io";
const SANDBOX_BASE = "https://sandbox.partner.deliveryhero.io";

const money = z.number().finite().min(0).max(1_000_000);
const address = z.object({
  formattedAddress: z.string().max(1000).optional().nullable(),
  street: z.string().max(200).optional().nullable(),
  number: z.string().max(80).optional().nullable(),
  building: z.string().max(120).optional().nullable(),
  apartment: z.string().max(120).optional().nullable(),
  floor: z.string().max(80).optional().nullable(),
  suburb: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  instructions: z.string().max(500).optional().nullable(),
  latitude: z.union([z.number(), z.string()]).optional().nullable(),
  longitude: z.union([z.number(), z.string()]).optional().nullable(),
}).passthrough();

const partnerOrder = z.object({
  order_id: z.string().trim().min(1).max(200),
  external_order_id: z.string().trim().max(250).optional().nullable(),
  order_code: z.string().trim().max(100).optional().nullable(),
  status: z.string().trim().min(1).max(64),
  transport_type: z.string().trim().min(1).max(64),
  order_type: z.string().trim().max(32).optional().nullable(),
  comment: z.string().max(1000).optional().nullable(),
  promised_for: z.string().max(64).optional().nullable(),
  accepted_for: z.string().max(64).optional().nullable(),
  client: z.object({
    chain_id: z.string().trim().max(200).optional().nullable(),
    store_id: z.string().trim().min(1).max(200),
  }).passthrough(),
  customer: z.object({
    first_name: z.string().max(120).optional().nullable(),
    last_name: z.string().max(120).optional().nullable(),
    phone_number: z.string().max(40).optional().nullable(),
    delivery_address: address.optional().nullable(),
  }).passthrough(),
  items: z.array(z.object({
    sku: z.string().max(120).optional().nullable(),
    name: z.string().max(300).optional().nullable(),
    pricing: z.object({
      quantity: z.number().finite().min(0).max(10_000).optional().nullable(),
      unit_price: money.optional().nullable(),
      total_price: money.optional().nullable(),
    }).passthrough().optional().nullable(),
  }).passthrough()).max(200).optional(),
  payment: z.object({
    type: z.string().max(80).optional().nullable(),
    order_total: money.optional().nullable(),
    collect_at_pickup: money.optional().nullable(),
  }).passthrough().optional().nullable(),
  cancellation: z.object({
    reason: z.string().max(300).optional().nullable(),
    post_picked_up: z.boolean().optional().nullable(),
  }).passthrough().optional().nullable(),
}).passthrough();

export type PartnerOrder = z.infer<typeof partnerOrder>;

function coord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function addressText(value: PartnerOrder["customer"]["delivery_address"]): string {
  if (!value) return "";
  const parts = [value.street, value.number, value.building, value.apartment, value.floor, value.suburb, value.city]
    .map((part) => part?.trim())
    .filter(Boolean);
  return value.formattedAddress?.trim() || parts.join(", ");
}

function payIntentOf(value: PartnerOrder["payment"]): PayIntent {
  if (value?.type && value.type.trim().toUpperCase() === "PAID") return "online";
  if ((value?.collect_at_pickup ?? 0) > 0) return "nakit";
  return "online";
}

function collectAmountOf(value: PartnerOrder["payment"]): Kurus {
  return Math.round((value?.collect_at_pickup ?? 0) * 100);
}

function unitKurus(value: number | null | undefined): Kurus {
  return Math.round((value ?? 0) * 100);
}

/**
 * Partner webhook gövdesini IncomingOrder'a çevirir.
 * Yalnızca restoranın kendi kuryesiyle teslim ettiği (VENDOR_DELIVERY) ve yeni gelen
 * (RECEIVED) siparişler içe alınır; platform kuryeli ve gel-al siparişler yok sayılır.
 */
export function parsePartnerPayload(json: unknown, cfg?: Pick<PartnerCredentials, "externalStoreId">): IncomingOrder[] {
  const parsed = partnerOrder.safeParse(json);
  if (!parsed.success) throw new Error("Yemeksepeti Partner gövdesi tanınmadı.");
  const o = parsed.data;
  if (o.status.toUpperCase() !== "RECEIVED") return [];
  if (o.transport_type.toUpperCase() !== "VENDOR_DELIVERY") return [];
  if (o.order_type?.toUpperCase() === "PICKUP") return [];
  if (cfg?.externalStoreId && cfg.externalStoreId !== o.client.store_id) return [];

  const name = [o.customer.first_name, o.customer.last_name].map((part) => part?.trim()).filter(Boolean).join(" ") || "Yemeksepeti müşterisi";
  const rawPhone = o.customer.phone_number?.trim() ?? "";
  const phone = rawPhone.replace(/\D/g, "").length >= 6 ? rawPhone : "";

  return [{
    externalId: o.order_id,
    externalCode: o.order_code ?? o.external_order_id ?? null,
    customer: { name, phone },
    address: addressText(o.customer.delivery_address),
    dropoffLat: coord(o.customer.delivery_address?.latitude),
    dropoffLng: coord(o.customer.delivery_address?.longitude),
    directions: o.customer.delivery_address?.instructions?.trim() || null,
    note: o.comment?.trim() || null,
    payIntent: payIntentOf(o.payment),
    deadline: o.promised_for ?? null,
    promisedAt: o.promised_for ?? null,
    collectAmount: collectAmountOf(o.payment),
    deliveryOwner: "vendor",
    raw: o,
    lines: (o.items ?? []).map((item) => ({
      code: item.sku?.trim() || item.name?.trim() || "yemeksepeti",
      name: item.name?.trim() || "Ürün",
      unitPrice: unitKurus(item.pricing?.unit_price ?? item.pricing?.total_price),
      qtyMilli: Math.max(1, Math.round((item.pricing?.quantity ?? 1) * 1000)),
      note: null,
    })),
  }];
}

const catalogJob = z.object({
  job_id: z.string().trim().min(1).max(200),
  status: z.string().trim().max(40).optional().nullable(),
  job_status: z.string().trim().max(40).optional().nullable(),
  download_url: z.string().trim().url().max(2048).optional().nullable(),
}).passthrough();

/** Katalog job sonucu ve iptal webhook'larını olaya çevirir. */
export function parsePartnerEvent(json: unknown): PlatformWebhookEvent[] {
  const job = catalogJob.safeParse(json);
  if (job.success && !(json && typeof json === "object" && "order_id" in json)) {
    return [{ type: "catalog_job", jobId: job.data.job_id, status: job.data.status ?? job.data.job_status ?? "UNKNOWN", downloadUrl: job.data.download_url ?? null }];
  }
  const parsed = partnerOrder.safeParse(json);
  if (!parsed.success) throw new Error("Yemeksepeti Partner gövdesi tanınmadı.");
  const o = parsed.data;
  const status = o.status.toUpperCase();
  if (status !== "CANCELLED" && status !== "CANCELED") return [];
  return [{
    type: "cancel",
    externalId: o.order_id,
    reason: o.cancellation?.reason?.trim() || "Platform iptali",
    postPickedUp: o.cancellation?.post_picked_up === true,
  }];
}

type Token = { token: string; expiresAt: number };
const tokens = new Map<string, Token>();

function config(conn: Conn): { cfg: PartnerCredentials; base: string } {
  const cfg = readConnectionCredentials(conn);
  if (!cfg || cfg.mode !== "partner") throw new Error("Yemeksepeti partner kimliği tanımlı değil.");
  const base = (cfg.base ?? process.env.YEMEKSEPETI_PARTNER_BASE ?? (process.env.YEMEKSEPETI_ENV === "production" ? PROD_BASE : SANDBOX_BASE)).replace(/\/+$/, "");
  return { cfg, base };
}

async function accessToken(conn: Conn, cfg: PartnerCredentials, base: string): Promise<string> {
  const key = `${conn.id}:${cfg.clientId}:${base}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch(`${base}/v2/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Yemeksepeti kimlik hatası: HTTP ${response.status}`);
  const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive().optional() })
    .safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("Yemeksepeti kimlik cevabı tanınmadı.");
  tokens.set(key, { token: parsed.data.access_token, expiresAt: Date.now() + (parsed.data.expires_in ?? 3600) * 1000 });
  return parsed.data.access_token;
}

async function updateOrder(conn: Conn, orderId: string, status: "READY_FOR_PICKUP" | "DISPATCHED" | "CANCELLED", extra?: Record<string, unknown>) {
  const { cfg, base } = config(conn);
  const token = await accessToken(conn, cfg, base);
  const response = await fetch(`${base}/v2/chains/${encodeURIComponent(cfg.chainId)}/orders/${encodeURIComponent(orderId)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ order_id: orderId, status, items: [], ...extra }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Yemeksepeti güncelleme hatası: HTTP ${response.status}`);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function webhookTokenValid(conn: Conn, headers: Headers): boolean {
  const expected = conn.webhookSecret.trim();
  if (!expected) return false;
  const raw = (headers.get("authorization") ?? headers.get("x-webhook-token") ?? "").trim();
  if (!raw) return false;
  return safeEqual(raw, expected) || safeEqual(raw.replace(/^Bearer\s+/i, "").trim(), expected);
}

export function createYemeksepetiPartnerSource(enabled: boolean): OrderSource {
  return {
    id: "yemeksepeti",
    ready: true,
    parseWebhook(raw, headers, conn) {
      if (!enabled) return { error: "Yemeksepeti bağlantısı kapalı.", status: 400 };
      if (!webhookTokenValid(conn, headers)) return { error: "Webhook jetonu geçersiz.", status: 401 };
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
      try {
        const cfg = readConnectionCredentials(conn);
        return parsePartnerPayload(json, cfg?.mode === "partner" ? cfg : undefined);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Biçim hatalı.", status: 400 };
      }
    },
    parseEvent(raw, headers, conn) {
      if (!enabled) return { error: "Yemeksepeti bağlantısı kapalı.", status: 400 };
      if (!webhookTokenValid(conn, headers)) return { error: "Webhook jetonu geçersiz.", status: 401 };
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return { error: "JSON değil.", status: 400 }; }
      try { return parsePartnerEvent(json); } catch (error) {
        return { error: error instanceof Error ? error.message : "Biçim hatalı.", status: 400 };
      }
    },
    // Partner API'de "kabul" çağrısı yok; sipariş RECEIVED olarak POS'a düşer.
    // Hazır bildirimi mutfak "hazır" olayında (pushStatus "ready") gönderilir.
    async accept(conn, externalId, prepMin) {
      if (!enabled) throw new Error("Yemeksepeti bağlantısı kapalı.");
      void conn; void externalId; void prepMin;
    },
    async reject(conn, externalId, reason) {
      if (!enabled) throw new Error("Yemeksepeti bağlantısı kapalı.");
      await updateOrder(conn, externalId, "CANCELLED", { cancellation: { reason } });
    },
    // Partner API'de DELIVERED durumu yok; DISPATCHED son durumdur. Teslim, kurye akışında kalır.
    async pushStatus(conn, externalId, status: PlatformOrderStatus, context) {
      if (!enabled) throw new Error("Yemeksepeti bağlantısı kapalı.");
      // Şartnamede ürün bazlı durum zorunluysa YEMEKSEPETI_SEND_ITEMS=1 ile açılır.
      const items = process.env.YEMEKSEPETI_SEND_ITEMS === "1" ? (context?.items ?? []) : [];
      if (status === "cancelled") { await updateOrder(conn, externalId, "CANCELLED", { items }); return; }
      if (status === "ready") { await updateOrder(conn, externalId, "READY_FOR_PICKUP", { items }); return; }
      await updateOrder(conn, externalId, "DISPATCHED");
    },
    async pushCatalog(conn, items) {
      if (!enabled) return { error: "Yemeksepeti bağlantısı kapalı." };
      const { cfg, base } = config(conn);
      const token = await accessToken(conn, cfg, base);
      const products = items.map((item) => ({
        sku: item.code,
        price: item.price / 100,
        active: item.active && (item.stock === null || item.stock > 0),
        ...(item.stock === null ? {} : { quantity: item.stock }),
      }));
      const response = await fetch(`${base}/v2/chains/${encodeURIComponent(cfg.chainId)}/vendors/${encodeURIComponent(cfg.vendorId)}/catalog`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ products }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Yemeksepeti katalog hatası: HTTP ${response.status}`);
      // 202: iş kuyruğa alındı; kesin sonuç job webhook'uyla gelir. Senkron sayaç yoksa kabul sayılır.
      const sync = z.object({ ok: z.number().int().min(0), failed: z.number().int().min(0) }).safeParse(await response.json().catch(() => null));
      return sync.success ? sync.data : { ok: products.length, failed: 0 };
    },
  };
}
