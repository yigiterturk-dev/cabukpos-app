// lib/delivery/ynr.ts — CabukPOS → YNR Kurye köprüsü.
// Sipariş oluşunca dispatchReady=false, mutfak "hazır" olunca dispatchReady=true gönderilir.
// Kimlik: platform_connections satırı (platform="ynr", şifreli base+token) veya YNR_BASE_URL/YNR_TOKEN.
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { foldTabs, type TabEv, type TabState } from "@/lib/core/tab";
import { readPlatformApi } from "@/lib/platform/credentials";

type YnrOrder = {
  externalId: string;
  externalCode?: string | null;
  customer: { name: string; phone: string };
  address: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  note?: string | null;
  collectAmount?: number | null;
};

type YnrResult = { ok: boolean; skipped?: string; error?: string };
export const PLATFORM_ORDER_SOURCES = new Set(["yemeksepeti", "migros", "getir", "trendyol", "trendyol_yemek"]);

function accountFor(storeId: string): string {
  try {
    const raw = process.env.YNR_ACCOUNTS_JSON?.trim();
    const map = raw ? JSON.parse(raw) as Record<string, string> : null;
    return map?.[storeId] ?? storeId;
  } catch { return storeId; }
}

async function config(tenantId: string, storeId: string): Promise<{ base: string; token: string; accountId: string } | null> {
  const [row] = await withTenant(tenantId, (tx) => tx.select({ credentials: schema.platformConnections.credentials, active: schema.platformConnections.active })
    .from(schema.platformConnections)
    .where(and(eq(schema.platformConnections.storeId, storeId), eq(schema.platformConnections.platform, "ynr"))));
  const saved = row?.active ? readPlatformApi(row) : null;
  const base = (saved?.base ?? process.env.YNR_BASE_URL ?? process.env.YNR_API_BASE ?? "").replace(/\/+$/, "");
  const token = saved?.key ?? process.env.YNR_TOKEN ?? "";
  return base && token ? { base, token, accountId: accountFor(storeId) } : null;
}

async function writeAudit(tenantId: string, action: string, detail: Record<string, unknown>) {
  try { await withTenant(tenantId, (tx) => audit(tx, tenantId, "system", action, detail)); } catch { /* audit hatası akışı durdurmaz */ }
}

/** Test edilebilir gövde üreticisi; ağ/DB yok. */
export function buildYnrOrderBody(order: YnrOrder, accountId: string, dispatchReady: boolean) {
  return {
    provider: "cabukpos",
    accountId,
    externalOrderId: order.externalId,
    dispatchReady,
    order: {
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      pickupAddress: "CabukPOS",
      pickupLat: 0,
      pickupLng: 0,
      dropoffAddress: order.address,
      dropoffLat: order.dropoffLat,
      dropoffLng: order.dropoffLng,
      price: 0,
      codAmount: Math.max(0, (order.collectAmount ?? 0) / 100),
      notes: [order.externalCode, order.note].filter(Boolean).join(" · ").slice(0, 1000) || undefined,
    },
  };
}

/** Siparişi YNR'ye aktarır. Aynı externalOrderId tekrar gönderilirse YNR tarafı tekilleştirir. */
export async function pushYnrOrder(tenantId: string, storeId: string, order: YnrOrder, dispatchReady: boolean, auditSuccess = true): Promise<YnrResult> {
  const cfg = await config(tenantId, storeId);
  if (!cfg) return { ok: false, skipped: "ynr_yapilandirilmamis" };
  if (!order.address.trim() || order.customer.phone.trim().replace(/\D/g, "").length < 8) {
    await writeAudit(tenantId, "ynr.skip", { storeId, externalId: order.externalId, reason: "adres_veya_telefon_eksik" });
    return { ok: false, skipped: "adres_veya_telefon_eksik" };
  }
  if (order.dropoffLat == null || order.dropoffLng == null) {
    await writeAudit(tenantId, "ynr.skip", { storeId, externalId: order.externalId, reason: "teslim_koordinati_yok" });
    return { ok: false, skipped: "teslim_koordinati_yok" };
  }
  const body = buildYnrOrderBody(order, cfg.accountId, dispatchReady);
  try {
    const response = await fetch(`${cfg.base}/api/integrations/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      await writeAudit(tenantId, "ynr.error", { storeId, externalId: order.externalId, status: response.status, detail: detail.slice(0, 300) });
      return { ok: false, error: `HTTP ${response.status}` };
    }
    if (auditSuccess) await writeAudit(tenantId, "ynr.push", { storeId, externalId: order.externalId, dispatchReady });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeAudit(tenantId, "ynr.error", { storeId, externalId: order.externalId, error: message });
    return { ok: false, error: message };
  }
}

async function loadTab(tenantId: string, tabId: string): Promise<TabState | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(schema.tabEvents).where(eq(schema.tabEvents.tabId, tabId)).orderBy(schema.tabEvents.seq, schema.tabEvents.id);
    const events = rows.map((row) => ({
      id: row.id, tabId: row.tabId, tableId: row.tableId, at: row.at.toISOString(),
      staffId: row.staffId, approvedBy: row.approvedBy, seq: row.seq, ev: row.payload as TabEv,
    }));
    return foldTabs(events).get(tabId) ?? null;
  });
}

/** Mutfak "hazır" olunca aynı siparişi dispatchReady=true ile YNR'ye tekrar gönderir. */
export async function notifyYnrReady(tenantId: string, storeId: string, tabId: string): Promise<YnrResult> {
  const tab = await loadTab(tenantId, tabId);
  if (!tab?.order) return { ok: false, skipped: "siparis_yok" };
  if (!tab.order.source?.platform || !PLATFORM_ORDER_SOURCES.has(tab.order.source.platform)) return { ok: false, skipped: "platform_degil" };
  return pushYnrOrder(tenantId, storeId, {
    externalId: tab.order.source?.externalId ?? tab.id,
    customer: { name: tab.order.name, phone: tab.order.phone },
    address: tab.order.address,
    dropoffLat: tab.order.dropoffLat ?? null,
    dropoffLng: tab.order.dropoffLng ?? null,
    note: tab.order.note,
  }, true);
}

/** CabukPOS iptali YNR'ye bildirir; paket alınmışsa YNR inceleme açar. */
export async function notifyYnrCancel(tenantId: string, storeId: string, tabId: string, reason: string): Promise<YnrResult> {
  const tab = await loadTab(tenantId, tabId);
  if (!tab?.order) return { ok: false, skipped: "siparis_yok" };
  if (!tab.order.source?.platform || !PLATFORM_ORDER_SOURCES.has(tab.order.source.platform)) return { ok: false, skipped: "platform_degil" };
  const cfg = await config(tenantId, storeId);
  if (!cfg) return { ok: false, skipped: "ynr_yapilandirilmamis" };
  const externalId = tab.order.source?.externalId ?? tab.id;
  const postPickupFlag = Boolean(tab.delivery.outAt || tab.delivery.handedOver || tab.delivery.deliveredAt);
  try {
    const response = await fetch(`${cfg.base}/api/integrations/orders/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ provider: "cabukpos", accountId: cfg.accountId, externalOrderId: externalId, reason: reason.slice(0, 300), postPickupFlag }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 202) {
      const detail = await response.text().catch(() => "");
      await writeAudit(tenantId, "ynr.cancel.error", { storeId, externalId, status: response.status, detail: detail.slice(0, 300) });
      return { ok: false, error: `HTTP ${response.status}` };
    }
    await writeAudit(tenantId, "ynr.cancel", { storeId, externalId, postPickupFlag });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeAudit(tenantId, "ynr.cancel.error", { storeId, externalId, error: message });
    return { ok: false, error: message };
  }
}
