// lib/courier/send.ts — Paket siparişini dış kurye (YNR) sevkine verir, iptal eder, durumunu okur.
// Ağ isteği DB işlemi dışında yapılır; sonuç audit'e yazılır. Yapılandırma yoksa ağa çıkılmaz.
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { foldTabs } from "@/lib/core/tab";
import { geocode } from "@/lib/geo/geocode";
import { schema, withTenant } from "@/db";
import { tabEventsOf } from "@/lib/sync/apply";
import { deliveryIsReady, ynrOrderFromTab } from "./payload";
import { createYnrClient, ynrConfig, ynrTarget } from "./ynr";

export type CourierResult =
  | { ok: true; code: string | null; dryRun: boolean; ready: boolean }
  | { ok: false; error: string; status?: number };

async function loadTab(tenantId: string, tabId: string) {
  return withTenant(tenantId, async (tx) => {
    const events = await tabEventsOf(tx, tabId);
    const tab = foldTabs(events).get(tabId);
    const [row] = await tx.select({ storeId: schema.tabEvents.storeId }).from(schema.tabEvents).where(eq(schema.tabEvents.tabId, tabId)).limit(1);
    return tab && row ? { tab, storeId: row.storeId } : null;
  });
}

async function record(tenantId: string, actor: string, action: string, detail: Record<string, unknown>) {
  await withTenant(tenantId, (tx) => audit(tx, tenantId, actor, action, detail));
}

/** Paketi kurye havuzuna verir. `ready` verilmezse bilet durumundan hesaplanır. */
export async function dispatchToCourier(tenantId: string, tabId: string, actor: string, ready?: boolean): Promise<CourierResult> {
  const cfg = ynrConfig();
  if (!cfg) return { ok: false, error: "Kurye bağlantısı yapılandırılmamış." };
  const loaded = await loadTab(tenantId, tabId);
  if (!loaded) return { ok: false, error: "Adisyon bulunamadı.", status: 404 };
  const target = ynrTarget(cfg, loaded.storeId);
  if (!target) return { ok: false, error: "Bu şube için kurye mağaza kimliği veya alım noktası tanımlı değil." };

  const isReady = ready ?? deliveryIsReady(loaded.tab);
  const coords = await geocode(loaded.tab.order?.address ?? "");
  if (!coords) {
    await record(tenantId, actor, "courier.dispatch", { tabId, storeId: loaded.storeId, error: "adres çözülemedi" });
    return { ok: false, error: "Teslim adresi koordinata çevrilemedi.", status: 422 };
  }

  const payload = ynrOrderFromTab(loaded.tab, { provider: cfg.provider, accountId: target.accountId, pickup: target.pickup, dropoff: coords }, isReady);
  if (!payload.ok) return { ok: false, error: payload.error, status: 400 };

  const res = await createYnrClient(cfg).sendOrder(payload.order);
  await record(tenantId, actor, "courier.dispatch", {
    tabId, storeId: loaded.storeId, externalOrderId: tabId, ready: isReady,
    ...(res.ok ? { http: res.status, code: (res.data as { code?: string }).code ?? null, dryRun: cfg.dryRun } : { error: res.error, http: res.status }),
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };

  // Sevk başarılı: panonun okuyacağı son durum satırını yaz (cron tazeler).
  const now = new Date();
  await withTenant(tenantId, (tx) => tx.insert(schema.courierJobs)
    .values({ tenantId, storeId: loaded.storeId, tabId, provider: cfg.provider, status: "sent", updatedAt: now })
    .onConflictDoUpdate({ target: [schema.courierJobs.tenantId, schema.courierJobs.tabId], set: { status: "sent", updatedAt: now } }));

  const data = res.data as { code?: string };
  return { ok: true, code: data.code ?? null, dryRun: cfg.dryRun, ready: isReady };
}

/** Paket kurye almadan iptal edilirse YNR'de de kapatılır; alınmışsa incelemeye bırakılır. */
export async function cancelWithCourier(tenantId: string, tabId: string, actor: string, postPickup?: boolean): Promise<CourierResult> {
  const cfg = ynrConfig();
  if (!cfg) return { ok: false, error: "Kurye bağlantısı yapılandırılmamış." };
  const loaded = await loadTab(tenantId, tabId);
  if (!loaded) return { ok: false, error: "Adisyon bulunamadı.", status: 404 };
  const target = ynrTarget(cfg, loaded.storeId);
  if (!target) return { ok: false, error: "Bu şube için kurye mağaza kimliği tanımlı değil." };
  // Paket kurye tarafından alınmışsa YNR siparişi sessizce iptal etmez; incelemeye açar.
  const pickedUp = postPickup ?? Boolean(loaded.tab.delivery.outAt);

  const res = await createYnrClient(cfg).cancelOrder({ provider: cfg.provider, accountId: target.accountId, externalOrderId: tabId, postPickupFlag: pickedUp });
  await record(tenantId, actor, "courier.cancel", {
    tabId, storeId: loaded.storeId, externalOrderId: tabId, postPickup: pickedUp,
    ...(res.ok ? { http: res.status, dryRun: cfg.dryRun } : { error: res.error, http: res.status }),
  });
  return res.ok ? { ok: true, code: null, dryRun: cfg.dryRun, ready: false } : { ok: false, error: res.error, status: res.status };
}

export type CourierStatus = {
  status: string;
  courierName: string | null;
  etaMinutes: number | null;
  collectionMinor: number | null;
  collected: boolean;
};

/** Kurye ataması, yolda/teslim durumu ve ETA'yı okur (polling). */
export async function courierStatus(tenantId: string, tabId: string): Promise<CourierStatus | { error: string; status?: number }> {
  const cfg = ynrConfig();
  if (!cfg) return { error: "Kurye bağlantısı yapılandırılmamış." };
  const loaded = await loadTab(tenantId, tabId);
  if (!loaded) return { error: "Adisyon bulunamadı.", status: 404 };
  const target = ynrTarget(cfg, loaded.storeId);
  if (!target) return { error: "Bu şube için kurye mağaza kimliği tanımlı değil." };

  const res = await createYnrClient(cfg).getStatus({ provider: cfg.provider, accountId: target.accountId, externalOrderId: tabId });
  if (!res.ok) return { error: res.error, status: res.status };
  const data = res.data as { status?: string; dryRun?: boolean; arrival?: { courierName?: string | null; etaMinutes?: number | null }; collection?: { amountMinor?: number; collected?: boolean } };
  if (data.dryRun) return { status: "dry_run", courierName: null, etaMinutes: null, collectionMinor: null, collected: false };
  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    courierName: data.arrival?.courierName ?? null,
    etaMinutes: typeof data.arrival?.etaMinutes === "number" ? data.arrival.etaMinutes : null,
    collectionMinor: typeof data.collection?.amountMinor === "number" ? data.collection.amountMinor : null,
    collected: data.collection?.collected === true,
  };
}
