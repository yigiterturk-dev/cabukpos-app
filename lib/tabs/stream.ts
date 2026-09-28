// lib/tabs/stream.ts — Adisyon akışı sorguları (şube içi, sunucu sırası). SSE uç noktası ve testler kullanır.
import { and, asc, eq, gt, gte, inArray } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { toTabEvent } from "@/lib/sync/apply";
import type { TabEvent } from "@/lib/core/tab";

type Ctx = { tenantId: string; storeId: string };
const E = schema.tabEvents;
export const INITIAL_WINDOW_MS = 24 * 3600_000;
export const STREAM_BATCH = 500;

/** seq > after olan olaylar (en çok STREAM_BATCH). */
export function eventsAfter(ctx: Ctx, after: number): Promise<TabEvent[]> {
  return withTenant(ctx.tenantId, async (tx) =>
    (await tx.select().from(E).where(and(eq(E.storeId, ctx.storeId), gt(E.seq, after))).orderBy(asc(E.seq)).limit(STREAM_BATCH)).map(toTabEvent));
}

/** İlk bağlantı: son 24 saatte olayı olan adisyonların TÜM olayları (eski açık adisyon da eksiksiz katlansın). */
export function initialEvents(ctx: Ctx, now = Date.now()): Promise<TabEvent[]> {
  return withTenant(ctx.tenantId, async (tx) => {
    const recent = await tx.selectDistinct({ tabId: E.tabId }).from(E).where(and(eq(E.storeId, ctx.storeId), gte(E.syncedAt, new Date(now - INITIAL_WINDOW_MS))));
    if (!recent.length) return [];
    return (await tx.select().from(E).where(and(eq(E.storeId, ctx.storeId), inArray(E.tabId, recent.map((r) => r.tabId)))).orderBy(asc(E.seq))).map(toTabEvent);
  });
}
