// lib/admin/tabs.ts — açık adisyon sayacı: son 30 günde hareket görmüş adisyonların tüm olayları katlanır.
// Kapanış kuralı olaylardan türetildiği için (ödeme/iptal/ikram) tek bir SQL bayrağı yok; fold tek doğru kaynaktır.
import { and, gte, inArray } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { foldTabs } from "@/lib/core/tab";
import { toTabEvent } from "@/lib/sync/apply";

export const OPEN_WINDOW_MS = 30 * 24 * 3600_000;

export type TabCounts = { open: number; masa: number; paket: number; remaining: number };

/** Şube kimliği → açık adisyon sayısı/tahsil edilecek tutar. storeIds verilirse yalnız o şubeler. */
export async function openTabCounts(tx: Tx, storeIds?: string[], now = Date.now()): Promise<Map<string, TabCounts>> {
  const E = schema.tabEvents;
  const active = await tx.selectDistinct({ storeId: E.storeId, tabId: E.tabId }).from(E)
    .where(and(gte(E.syncedAt, new Date(now - OPEN_WINDOW_MS)), storeIds?.length ? inArray(E.storeId, storeIds) : undefined));
  if (!active.length) return new Map();
  // Pencere yalnız aday seçiminde: eski açık adisyonun tüm olayları eksiksiz katlanır.
  const rows = await tx.select().from(E)
    .where(and(inArray(E.tabId, [...new Set(active.map((a) => a.tabId))]), storeIds?.length ? inArray(E.storeId, storeIds) : undefined))
    .orderBy(E.seq);
  const byStore = new Map<string, Set<string>>();
  for (const a of active) byStore.set(a.storeId, (byStore.get(a.storeId) ?? new Set()).add(a.tabId));
  const out = new Map<string, TabCounts>();
  for (const [storeId, ids] of byStore) {
    const tabs = foldTabs(rows.filter((r) => r.storeId === storeId && ids.has(r.tabId)).map(toTabEvent));
    let open = 0, masa = 0, paket = 0, remaining = 0;
    for (const t of tabs.values()) {
      if (t.closed) continue;
      open++;
      if (t.kind === "masa") masa++; else paket++;
      remaining += t.remaining;
    }
    out.set(storeId, { open, masa, paket, remaining });
  }
  return out;
}
