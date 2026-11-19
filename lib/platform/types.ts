// lib/platform/types.ts — Sipariş platformu adaptör arayüzü (sunucu). Gerçek YS/TGO adaptörleri onay gelince buraya eklenir.
import type { IncomingOrder } from "@/lib/core/platform";

export type Conn = { id: string; tenantId: string; storeId: string; platform: string; credentials: string | null; webhookSecret: string; webhookToken: string; autoAccept: boolean; active: boolean };

/** Geri push satırı (#29): POS'taki eşlenmiş ürünün platformdaki hâli. stock null = stok takibi yok. */
export type OutboundItem = { code: string; name: string; price: number; stock: number | null; active: boolean };

/** Sipariş durum geri bildirimi (M6 kalanı): mutfak hazır / kurye aldı / teslim / iptal. */
export type PlatformOrderStatus = "ready" | "picked" | "delivered" | "cancelled";

/** Platformdan gelen sipariş olmayan olaylar (şu an yalnız iptal). */
export type PlatformItemStatus = "PICKED" | "UNAVAILABLE";

export type PlatformWebhookEvent =
  | { type: "cancel"; externalId: string; reason: string; postPickedUp: boolean }
  | { type: "catalog_job"; jobId: string; status: string; downloadUrl: string | null };

export interface OrderSource {
  id: string;
  /** "ready" durumunu platforma bildirebiliyor mu (ör. Yemeksepeti READY_FOR_PICKUP). */
  ready?: boolean;
  /** Webhook gövdesini doğrular + çözer. Hata: 401 imza, 400 biçim. */
  parseWebhook(body: string, headers: Headers, conn: Conn): IncomingOrder[] | { error: string; status: 400 | 401 };
  /** Sipariş dışı olaylar (iptal). Desteklemeyen adaptör tanımlamaz. */
  parseEvent?(body: string, headers: Headers, conn: Conn): PlatformWebhookEvent[] | { error: string; status: 400 | 401 };
  accept(conn: Conn, externalId: string, prepMin: number): Promise<void>;
  reject(conn: Conn, externalId: string, reason: string): Promise<void>;
  /** Durum geri bildirimi: desteklemeyen adaptör tanımlamaz; çağıran sessizce atlar. */
  pushStatus?(conn: Conn, externalId: string, status: PlatformOrderStatus, context?: { items?: { sku: string; status: PlatformItemStatus }[] }): Promise<void>;
  /** Menü/fiyat/stok geri push'u (#29). Desteklemeyen adaptör tanımlamaz; çağıran "unsupported" der. */
  pushCatalog?(conn: Conn, items: OutboundItem[]): Promise<{ ok: number; failed: number } | { error: string }>;
}
