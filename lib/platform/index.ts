// lib/platform/index.ts — adaptör kaydı + bağlantı okuma (RLS dışı kimlik tablosu; her sorguda kiracı koşulu).
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getirSource } from "./getir";
import { migrosSource } from "./migros";
import { mockSource } from "./mock";
import { tiklaGelsinSource } from "./tiklagelsin";
import { trendyolSource } from "./trendyol";
import { trendyolYemekSource } from "./trendyol-yemek";
import { yemeksepetiSource } from "./yemeksepeti";
import type { Conn, OrderSource } from "./types";

// mock varsayılan kalır; getir/yemeksepeti/trendyol/migros/tiklagelsin sandbox sürücüleri varsayılan kapalı (env ile açılır).
const SOURCES: Record<string, OrderSource> = { mock: mockSource, getir: getirSource, yemeksepeti: yemeksepetiSource, trendyol: trendyolSource, trendyol_yemek: trendyolYemekSource, migros: migrosSource, tiklagelsin: tiklaGelsinSource };
export const sourceFor = (platform: string): OrderSource | null => SOURCES[platform] ?? null;
export const SUPPORTED_PLATFORMS = Object.keys(SOURCES);
/** Bağlanabilir kaynaklar: adaptörlüler + kiosko (webhook'suz; sipariş /api/kiosk'tan gelir, menü QR'ıyla açılır). */
export const CONNECTABLE_PLATFORMS = [...SUPPORTED_PLATFORMS, "kiosk"];

const P = schema.platformConnections;
const cols = { id: P.id, tenantId: P.tenantId, storeId: P.storeId, platform: P.platform, credentials: P.credentials, webhookSecret: P.webhookSecret, webhookToken: P.webhookToken, autoAccept: P.autoAccept, active: P.active };

/** Webhook: kimlik yalnız bağlantı kimliği (+ platform adı). Eski URL'ler için; #30 token yoluna taşınıyor. */
export async function connectionById(id: string, platform: string): Promise<Conn | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await getDb().select(cols).from(P).where(and(eq(P.id, id), eq(P.platform, platform), eq(P.active, true)));
  return c ?? null;
}

/** #30: webhook adresi tahmin edilemez jeton taşır; bağlantı kimliği URL'de dolaşmaz. */
export async function connectionByToken(token: string, platform: string): Promise<Conn | null> {
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(token)) return null;
  const [c] = await getDb().select(cols).from(P).where(and(eq(P.webhookToken, token), eq(P.platform, platform), eq(P.active, true)));
  return c ?? null;
}

export async function connectionFor(tenantId: string, storeId: string, platform: string): Promise<Conn | null> {
  const [c] = await getDb().select(cols).from(P).where(and(eq(P.tenantId, tenantId), eq(P.storeId, storeId), eq(P.platform, platform)));
  return c ?? null;
}
