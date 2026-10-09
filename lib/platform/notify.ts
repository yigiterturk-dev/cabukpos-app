// lib/platform/notify.ts — Kasadaki kabul/red kararını platforma bildirir. İşlem dışı çağrılır (ağ isteği DB işlemini tutmasın).
// İdempotent: aynı sipariş için başarılı bildirim audit_log'da varsa tekrar çağrılmaz. Hata → olay review + audit.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { foldTabs, type TabEv } from "@/lib/core/tab";
import { tabEventsOf } from "@/lib/sync/apply";
import { connectionFor, sourceFor } from "./index";
import type { PlatformOrderStatus } from "./types";

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

/** Durum geri bildirimi (M6 kalanı): kurye aldı (out/handover), teslim, iptal → platforma.
 *  İdempotent (aynı externalId+status audit'te varsa atlanır); sürücü pushStatus tanımlamıyorsa sessiz;
 *  kiosk sanal bağlantıdır, bildirilmez. Hata → olay review + platform.error. */
export async function notifyPlatformStatus(tenantId: string, eventId: string, tabId: string, status: PlatformOrderStatus) {
  const found = await withTenant(tenantId, async (tx) => {
    const events = await tabEventsOf(tx, tabId);
    const t = foldTabs(events).get(tabId);
    const src = t?.kind === "platform" ? t.order?.source : null;
    if (!src || src.platform === "kiosk") return null;
    const storeId = (await tx.select({ s: schema.tabEvents.storeId }).from(schema.tabEvents).where(eq(schema.tabEvents.id, eventId)))[0]?.s;
    if (!storeId) return null;
    const A = schema.auditLog;
    const [done] = await tx.select({ id: A.id }).from(A).where(and(sql`${A.action} = 'platform.status'`, sql`${A.detail}->>'externalId' = ${src.externalId}`, sql`${A.detail}->>'status' = ${status}`));
    return done ? null : { src, storeId };
  });
  if (!found) return;
  const { src, storeId } = found;
  const conn = await connectionFor(tenantId, storeId, src.platform);
  const source = sourceFor(src.platform);
  if (!source?.pushStatus) return; // sürücü desteklemiyor → sessiz atla
  let error: string | null = null;
  if (!conn) error = "platform bağlantısı yok";
  else {
    try {
      await Promise.race([source.pushStatus(conn, src.externalId, status), new Promise((_, rej) => setTimeout(() => rej(new Error("zaman aşımı")), TIMEOUT_MS))]);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  await withTenant(tenantId, async (tx) => {
    if (error) {
      await tx.update(schema.tabEvents).set({ review: `platform durum bildirimi başarısız: ${error}` }).where(eq(schema.tabEvents.id, eventId));
      await audit(tx, tenantId, "system", "platform.error", { externalId: src.externalId, platform: src.platform, status, error });
    } else await audit(tx, tenantId, "system", "platform.status", { externalId: src.externalId, platform: src.platform, status });
  });
}
