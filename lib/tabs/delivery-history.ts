import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { toTabEvent } from "@/lib/sync/apply";
import { foldTabs } from "@/lib/core/tab";
import { deliveryDay } from "@/lib/core/dispatch";
import { isValidCalendarDay } from "@/lib/core/report";

export async function deliveryHistory(ctx: { tenantId: string; storeId: string }, day: string) {
  if (!isValidCalendarDay(day)) throw new Error("Geçersiz tarih.");
  const start = new Date(`${day}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 86400_000);
  const E = schema.tabEvents;
  return withTenant(ctx.tenantId, async tx => {
    const scope = and(eq(E.tenantId, ctx.tenantId), eq(E.storeId, ctx.storeId));
    const candidates = await tx.selectDistinct({ tabId: E.tabId }).from(E).where(and(scope, gte(E.at, start), lt(E.at, end))).limit(2001);
    if (candidates.length > 2000) throw new Error("Bu gün için çok fazla sipariş var; yönetim raporlarını kullanın.");
    if (!candidates.length) return [];
    const events = await tx.select().from(E).where(and(scope, inArray(E.tabId, candidates.map(t => t.tabId)))).orderBy(asc(E.seq)).limit(50001);
    if (events.length > 50000) throw new Error("Rapor sınırı aşıldı; yönetim raporlarını kullanın.");
    return [...foldTabs(events.map(toTabEvent)).values()].filter(t => t.kind !== "masa" && !t.mergedAway && deliveryDay(t) === day);
  });
}
