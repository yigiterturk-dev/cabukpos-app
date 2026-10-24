// lib/platform/notify.ts — Kasadaki kabul/red kararını platforma bildirir. İşlem dışı çağrılır (ağ isteği DB işlemini tutmasın).
// İdempotent: aynı sipariş için başarılı bildirim audit_log'da varsa tekrar çağrılmaz. Hata → olay review + audit.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { foldTabs, type TabEv } from "@/lib/core/tab";
import { tabEventsOf } from "@/lib/sync/apply";
import { connectionFor, sourceFor } from "./index";
import type { PlatformOrderStatus } from "./types";

const TIMEOUT_MS = 5000;

async function withTimeout(call: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([call, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("zaman aşımı")), TIMEOUT_MS); })]);
  } finally { clearTimeout(timer); }
}

/** Old audits did not carry a tab ID. Only trust those when the source identifies exactly one tab. */
async function recorded(tx: Tx, tabId: string, src: { platform: string; externalId: string }, action: string, status?: string) {
  const A = schema.auditLog, E = schema.tabEvents;
  const matches = and(eq(A.action, action), status ? sql`${A.detail}->>'status' = ${status}` : undefined);
  const [scoped] = await tx.select({ id: A.id }).from(A).where(and(matches, sql`${A.detail}->>'tabId' = ${tabId}`)).limit(1);
  if (scoped) return true;
  const [legacy] = await tx.select({ id: A.id }).from(A).where(and(matches, sql`${A.detail}->>'tabId' is null`, sql`${A.detail}->>'platform' = ${src.platform}`, sql`${A.detail}->>'externalId' = ${src.externalId}`)).limit(1);
  if (!legacy) return false;
  const orders = await tx.select({ tabId: E.tabId }).from(E).where(and(eq(E.type, "order"), sql`${E.payload}->'source'->>'platform' = ${src.platform}`, sql`${E.payload}->'source'->>'externalId' = ${src.externalId}`)).limit(2);
  return orders.length === 1 && orders[0].tabId === tabId;
}

async function clearFailure(tx: Tx, eventId: string, prefix: string) {
  const E = schema.tabEvents;
  await tx.update(E).set({ review: null }).where(and(eq(E.id, eventId), sql`${E.review} like ${prefix + '%'}`));
}

export async function notifyPlatform(tenantId: string, eventId: string, tabId: string, ev: Extract<TabEv, { type: "accept" | "reject" }>) {
  const found = await withTenant(tenantId, async (tx) => {
    const events = await tabEventsOf(tx, tabId);
    const t = foldTabs(events).get(tabId);
    const src = t?.kind === "platform" ? t.order?.source : null;
    const E = schema.tabEvents;
    const [event] = await tx.select({ storeId: E.storeId, review: E.review, payload: E.payload }).from(E).where(and(eq(E.id, eventId), eq(E.tabId, tabId), eq(E.type, ev.type)));
    if (!src || src.platform === "kiosk" || !event || (event.review && !event.review.startsWith("platform bildirimi başarısız:"))) return null;
    // An old acceptance must never resurrect a cancelled, rejected or dispatched order.
    if (ev.type === "accept" && (!t?.delivery.acceptedAt || t.closed || t.delivery.cancelled || t.delivery.rejected || t.delivery.outAt || t.delivery.deliveredAt || t.delivery.handedOver)) return null;
    if (ev.type === "reject" && !t?.delivery.rejected) return null;
    const done = await recorded(tx, tabId, src, `platform.${ev.type}`);
    return done ? null : { src, storeId: event.storeId, decision: event.payload as typeof ev };
  });
  if (!found) return;
  const { src, storeId, decision } = found;
  const conn = await connectionFor(tenantId, storeId, src.platform);
  const source = sourceFor(src.platform);
  let error: string | null = null;
  if (!conn?.active || !source) error = "etkin platform bağlantısı yok";
  else {
    try {
      const call = decision.type === "accept" ? source.accept(conn, src.externalId, decision.prepMin) : source.reject(conn, src.externalId, decision.reason);
      await withTimeout(call);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  await withTenant(tenantId, async (tx) => {
    if (error) {
      await tx.update(schema.tabEvents).set({ review: `platform bildirimi başarısız: ${error}` }).where(eq(schema.tabEvents.id, eventId));
      await audit(tx, tenantId, "system", "platform.error", { tabId, storeId, eventId, externalId: src.externalId, platform: src.platform, type: ev.type, error });
    } else {
      await clearFailure(tx, eventId, "platform bildirimi başarısız:");
      await audit(tx, tenantId, "system", `platform.${decision.type}`, { tabId, storeId, eventId, externalId: src.externalId, platform: src.platform, ...(decision.type === "accept" ? { prepMin: decision.prepMin } : { reason: decision.reason }) });
    }
  });
}

/** Durum geri bildirimi (M6 kalanı): kurye aldı (out/handover), teslim, iptal → platforma.
 *  İdempotent (aynı tabId+status audit'te varsa atlanır); sürücü pushStatus tanımlamıyorsa sessiz;
 *  kiosk sanal bağlantıdır, bildirilmez. Hata → olay review + platform.error. */
export async function notifyPlatformStatus(tenantId: string, eventId: string, tabId: string, status: PlatformOrderStatus) {
  const found = await withTenant(tenantId, async (tx) => {
    const events = await tabEventsOf(tx, tabId);
    const t = foldTabs(events).get(tabId);
    const src = t?.kind === "platform" ? t.order?.source : null;
    if (!src || src.platform === "kiosk") return null;
    const E = schema.tabEvents;
    const [event] = await tx.select({ storeId: E.storeId, type: E.type, review: E.review }).from(E).where(and(eq(E.id, eventId), eq(E.tabId, tabId)));
    const expected = event?.type === "out" || event?.type === "handover" ? "picked" : event?.type === "delivered" ? "delivered" : event?.type === "cancel" ? "cancelled" : null;
    if (!event || expected !== status || (event.review && !event.review.startsWith("platform durum bildirimi başarısız:"))) return null;
    if (status === "picked" && (t?.delivery.deliveredAt || t?.delivery.cancelled || t?.delivery.rejected)) return null;
    if (status === "delivered" && (t?.delivery.cancelled || t?.delivery.rejected)) return null;
    const done = await recorded(tx, tabId, src, "platform.status", status);
    return done ? null : { src, storeId: event.storeId };
  });
  if (!found) return;
  const { src, storeId } = found;
  const conn = await connectionFor(tenantId, storeId, src.platform);
  const source = sourceFor(src.platform);
  if (!source?.pushStatus) return; // sürücü desteklemiyor → sessiz atla
  let error: string | null = null;
  if (!conn?.active) error = "etkin platform bağlantısı yok";
  else {
    try {
      await withTimeout(source.pushStatus(conn, src.externalId, status));
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  await withTenant(tenantId, async (tx) => {
    if (error) {
      await tx.update(schema.tabEvents).set({ review: `platform durum bildirimi başarısız: ${error}` }).where(eq(schema.tabEvents.id, eventId));
      await audit(tx, tenantId, "system", "platform.error", { tabId, storeId, eventId, externalId: src.externalId, platform: src.platform, status, error });
    } else {
      await clearFailure(tx, eventId, "platform durum bildirimi başarısız:");
      await audit(tx, tenantId, "system", "platform.status", { tabId, storeId, eventId, externalId: src.externalId, platform: src.platform, status });
    }
  });
}
