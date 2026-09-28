// lib/platform/index.ts — adaptör kaydı + bağlantı okuma (RLS dışı kimlik tablosu; her sorguda kiracı koşulu).
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mockSource } from "./mock";
import type { Conn, OrderSource } from "./types";

const SOURCES: Record<string, OrderSource> = { mock: mockSource };
export const sourceFor = (platform: string): OrderSource | null => SOURCES[platform] ?? null;
export const SUPPORTED_PLATFORMS = Object.keys(SOURCES);

const P = schema.platformConnections;
const cols = { id: P.id, tenantId: P.tenantId, storeId: P.storeId, platform: P.platform, credentials: P.credentials, webhookSecret: P.webhookSecret, autoAccept: P.autoAccept };

/** Webhook: kimlik yalnız bağlantı kimliği (+ platform adı). */
export async function connectionById(id: string, platform: string): Promise<Conn | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await getDb().select(cols).from(P).where(and(eq(P.id, id), eq(P.platform, platform), eq(P.active, true)));
  return c ?? null;
}

export async function connectionFor(tenantId: string, storeId: string, platform: string): Promise<Conn | null> {
  const [c] = await getDb().select(cols).from(P).where(and(eq(P.tenantId, tenantId), eq(P.storeId, storeId), eq(P.platform, platform)));
  return c ?? null;
}
