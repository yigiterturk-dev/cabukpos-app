// lib/platform/types.ts — Sipariş platformu adaptör arayüzü (sunucu). Gerçek YS/TGO adaptörleri onay gelince buraya eklenir.
import type { IncomingOrder } from "@/lib/core/platform";

export type Conn = { id: string; tenantId: string; storeId: string; platform: string; credentials: string | null; webhookSecret: string; autoAccept: boolean };

export interface OrderSource {
  id: string;
  /** Webhook gövdesini doğrular + çözer. Hata: 401 imza, 400 biçim. */
  parseWebhook(body: string, headers: Headers, conn: Conn): IncomingOrder[] | { error: string; status: 400 | 401 };
  accept(conn: Conn, externalId: string, prepMin: number): Promise<void>;
  reject(conn: Conn, externalId: string, reason: string): Promise<void>;
}
