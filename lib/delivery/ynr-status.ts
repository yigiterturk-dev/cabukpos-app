// lib/delivery/ynr-status.ts — YNR kurye durumunu polling ile CabukPOS'a ve platforma yansıtır.
// YNR sözleşmesi: GET /api/integrations/orders/status?provider=cabukpos&accountId=<store>&externalOrderId=<id>
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { foldTabs, type TabEv } from "@/lib/core/tab";
import { initialEvents } from "@/lib/tabs/stream";
import { notifyPlatformStatus } from "@/lib/platform/notify";
import { readPlatformApi } from "@/lib/platform/credentials";
import { pushYnrOrder, PLATFORM_ORDER_SOURCES } from "./ynr";
import { deliveryIsReady } from "@/lib/courier/payload";

type StatusResponse = { status?: string };
type Result = { checked: number; updated: number; skipped: number; errors: number };

const PICKED = new Set(["picked", "picked_up", "on_the_way", "yolda", "yola_cikti"]);
const DELIVERED = new Set(["delivered", "teslim", "teslim_edildi"]);
const CANCELLED = new Set(["cancelled", "canceled", "failed", "iptal", "iptal_edildi"]);

function configOf(credentials: string | null): { base: string; token: string } | null {
  const saved = readPlatformApi({ credentials });
  const base = (saved?.base ?? process.env.YNR_BASE_URL ?? process.env.YNR_API_BASE ?? "").replace(/\/+$/, "");
  const token = saved?.key ?? process.env.YNR_TOKEN ?? "";
  return base && token ? { base, token } : null;
}

function accountFor(storeId: string): string {
  try {
    const raw = process.env.YNR_ACCOUNTS_JSON?.trim();
    const map = raw ? JSON.parse(raw) as Record<string, string> : null;
    return map?.[storeId] ?? storeId;
  } catch { return storeId; }
}

async function fetchStatus(base: string, token: string, storeId: string, externalId: string): Promise<string | null> {
  const query = new URLSearchParams({ provider: "cabukpos", accountId: storeId, externalOrderId: externalId });
  const response = await fetch(`${base}/api/integrations/orders/status?${query}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json().catch(() => null)) as StatusResponse | null;
  return data?.status?.toLowerCase() ?? null;
}

async function applyStatus(tenantId: string, storeId: string, tabId: string, platform: string, status: string): Promise<boolean> {
  const mapped = PICKED.has(status) ? "picked" : DELIVERED.has(status) ? "delivered" : CANCELLED.has(status) ? "cancelled" : null;
  if (!mapped) return false;
  const eventId = crypto.randomUUID();
  const inserted = await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ynr-status:${tabId}`}))`);
    const E = schema.tabEvents;
    const rows = await tx.select({ type: E.type, payload: E.payload }).from(E).where(eq(E.tabId, tabId));
    const existing = rows.some((row) => row.type === (mapped === "picked" ? "out" : mapped === "delivered" ? "delivered" : "cancel"));
    if (existing) return false;
    const payload: TabEv = mapped === "picked"
      ? { type: "out" }
      : mapped === "delivered"
        ? { type: "delivered", method: "online" }
        : { type: "cancel", reason: `YNR: ${status}` };
    await tx.insert(E).values({
      id: eventId, tenantId, storeId, tabId, tableId: null, deviceId: null, staffId: null,
      at: new Date(), type: payload.type, payload,
    });
    return true;
  });
  if (!inserted) return false;
  if (platform && platform !== "ynr" && platform !== "kiosk") {
    await notifyPlatformStatus(tenantId, eventId, tabId, mapped).catch(() => {});
  }
  return true;
}

/** Aktif YNR bağlantılarının açık siparişlerini tek turda senkronize eder. */
export async function syncYnrStatuses(limit = 200): Promise<Result> {
  const result: Result = { checked: 0, updated: 0, skipped: 0, errors: 0 };
  const P = schema.platformConnections;
  const connections = await getDb().select().from(P).where(and(eq(P.platform, "ynr"), eq(P.active, true)));
  const targets: { tenantId: string; storeId: string; credentials: string | null }[] = connections.map((c) => ({ tenantId: c.tenantId, storeId: c.storeId, credentials: c.credentials }));
  if (process.env.YNR_API_BASE && process.env.YNR_TOKEN) {
    const seen = new Set(targets.map((t) => t.storeId));
    const stores = await getDb().select({ id: schema.stores.id, tenantId: schema.stores.tenantId }).from(schema.stores);
    for (const store of stores) if (!seen.has(store.id) && accountFor(store.id) !== store.id) targets.push({ tenantId: store.tenantId, storeId: store.id, credentials: null });
  }
  for (const connection of targets) {
    const cfg = configOf(connection.credentials);
    if (!cfg) { result.skipped++; continue; }
    const tabs = [...foldTabs(await initialEvents({ tenantId: connection.tenantId, storeId: connection.storeId })).values()]
      .filter((tab) => !tab.closed && tab.order?.source?.externalId);
    for (const tab of tabs) {
      if (result.checked >= limit) return result;
      const externalId = tab.order!.source!.externalId;
      result.checked++;
      try {
        if (tab.order?.dropoffLat != null && tab.order.dropoffLng != null && PLATFORM_ORDER_SOURCES.has(tab.order.source!.platform)) {
          await pushYnrOrder(connection.tenantId, connection.storeId, {
            externalId, customer: { name: tab.order.name, phone: tab.order.phone },
            address: tab.order.address, dropoffLat: tab.order.dropoffLat, dropoffLng: tab.order.dropoffLng,
            note: tab.order.note,
          }, deliveryIsReady(tab), false);
        }
        const status = await fetchStatus(cfg.base, cfg.token, accountFor(connection.storeId), externalId);
        if (!status) { result.skipped++; continue; }
        const changed = await applyStatus(connection.tenantId, connection.storeId, tab.id, tab.order!.source!.platform, status);
        if (changed) result.updated++; else result.skipped++;
      } catch {
        result.errors++;
      }
    }
  }
  return result;
}
