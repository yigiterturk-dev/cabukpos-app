// lib/platform/types.ts — Sipariş platformu adaptör arayüzü (sunucu). Gerçek YS/TGO adaptörleri onay gelince buraya eklenir.
import type { IncomingOrder } from "@/lib/core/platform";

export type Conn = { id: string; tenantId: string; storeId: string; platform: string; credentials: string | null; webhookSecret: string; webhookToken: string; autoAccept: boolean; active: boolean };

/** Geri push satırı (#29): POS'taki eşlenmiş ürünün platformdaki hâli. stock null = stok takibi yok. */
export type OutboundItem = { code: string; name: string; price: number; stock: number | null; active: boolean };

/** Sipariş durum geri bildirimi (M6 kalanı): kabul sonrası kurye aldı / teslim / iptal. */
export type PlatformOrderStatus = "picked" | "delivered" | "cancelled";

export interface OrderSource {
  id: string;
  /** Webhook gövdesini doğrular + çözer. Hata: 401 imza, 400 biçim. */
  parseWebhook(body: string, headers: Headers, conn: Conn): IncomingOrder[] | { error: string; status: 400 | 401 };
  accept(conn: Conn, externalId: string, prepMin: number): Promise<void>;
  reject(conn: Conn, externalId: string, reason: string): Promise<void>;
  /** Durum geri bildirimi: desteklemeyen adaptör tanımlamaz; çağıran sessizce atlar. */
  pushStatus?(conn: Conn, externalId: string, status: PlatformOrderStatus): Promise<void>;
  /** Menü/fiyat/stok geri push'u (#29). Desteklemeyen adaptör tanımlamaz; çağıran "unsupported" der. */
  pushCatalog?(conn: Conn, items: OutboundItem[]): Promise<{ ok: number; failed: number } | { error: string }>;
}
