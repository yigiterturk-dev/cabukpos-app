// lib/platform/notify.ts — Kasadaki kabul/red kararını platforma bildirir. İşlem dışı çağrılır (ağ isteği DB işlemini tutmasın).
// İdempotent: aynı sipariş için başarılı bildirim audit_log'da varsa tekrar çağrılmaz. Hata → olay review + audit.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { foldTabs, type TabEv } from "@/lib/core/tab";
import { tabEventsOf } from "@/lib/sync/apply";
import { connectionFor, sourceFor } from "./index";

const TIMEOUT_MS = 5000;

export async function notifyPlatform(tenantId: string, eventId: string, tabId: string, ev: Extract<TabEv, { type: "accept" | "reject" }>) {
  const found = await withTenant(tenantId, async (tx) => {
    const events = await tabEventsOf(tx, tabId);
    const t = foldTabs(events).get(tabId);
    const src = t?.kind === "platform" ? t.order?.source : null;
    const storeId = (await tx.select({ s: schema.tabEvents.storeId }).from(schema.tabEvents).where(eq(schema.tabEvents.id, eventId)))[0]?.s;
    if (!src || !storeId) return null;
    const A = schema.auditLog;
    const [done] = await tx.select({ id: A.id }).from(A).where(and(sql`${A.action} in ('platform.accept', 'platform.reject')`, sql`${A.detail}->>'externalId' = ${src.externalId}`));
    return done ? null : { src, storeId };
  });
  if (!found) return;
  const { src, storeId } = found;
  const conn = await connectionFor(tenantId, storeId, src.platform);
  const source = sourceFor(src.platform);
  let error: string | null = null;
  if (!conn || !source) error = "platform bağlantısı yok";
  else {
    try {
      const call = ev.type === "accept" ? source.accept(conn, src.externalId, ev.prepMin) : source.reject(conn, src.externalId, ev.reason);
      await Promise.race([call, new Promise((_, rej) => setTimeout(() => rej(new Error("zaman aşımı")), TIMEOUT_MS))]);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  await withTenant(tenantId, async (tx) => {
    if (error) {
      await tx.update(schema.tabEvents).set({ review: `platform bildirimi başarısız: ${error}` }).where(eq(schema.tabEvents.id, eventId));
      await audit(tx, tenantId, "system", "platform.error", { externalId: src.externalId, platform: src.platform, type: ev.type, error });
    } else await audit(tx, tenantId, "system", `platform.${ev.type}`, { externalId: src.externalId, platform: src.platform, ...(ev.type === "accept" ? { prepMin: ev.prepMin } : { reason: ev.reason }) });
  });
}
