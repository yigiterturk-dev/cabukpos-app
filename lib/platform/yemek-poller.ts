// lib/platform/yemek-poller.ts — Trendyol Yemek siparişlerini polling ile içeri alır.
// Dokümanda POS'a webhook yok; `GET .../packages` tek kaynak. Aynı paket ikinci kez yazılmaz (ingestOrders tekilleştirir).
import { createYemekClient, parsePackages, toIncomingOrder } from "./trendyol-yemek";
import { ingestOrders } from "./ingest";
import type { Conn } from "./types";

/** Yeni paketler "Created" durumunda gelir; kabul edilmişleri tekrar çekmeye gerek yok. */
const NEW_STATUSES = "Created";

export type PollResult = { fetched: number; created: number; duplicates: number; unmapped: number } | { error: string };

function connection(env: NodeJS.ProcessEnv): Conn | null {
  const tenantId = env.TRENDYOL_YEMEK_TENANT_ID?.trim();
  const storeId = env.TRENDYOL_YEMEK_STORE_ID?.trim();
  if (!tenantId || !storeId) return null;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    tenantId,
    storeId,
    platform: "trendyol_yemek",
    credentials: null,
    webhookSecret: "polling",
    webhookToken: "polling",
    autoAccept: env.TRENDYOL_YEMEK_AUTO_ACCEPT === "1",
    active: true,
  };
}

export async function pollYemekOrders(env: NodeJS.ProcessEnv = process.env): Promise<PollResult> {
  if (env.TRENDYOL_YEMEK_ENABLED !== "1") return { error: "Trendyol Yemek kapalı." };
  const conn = connection(env);
  if (!conn) return { error: "TRENDYOL_YEMEK_TENANT_ID veya TRENDYOL_YEMEK_STORE_ID eksik." };

  let raw: unknown;
  try {
    raw = await createYemekClient().fetchPackages(NEW_STATUSES);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Trendyol Yemek'e ulaşılamadı." };
  }
  const packages = parsePackages(raw).filter((p) => p.status.toUpperCase() === "CREATED");
  if (!packages.length) return { fetched: 0, created: 0, duplicates: 0, unmapped: 0 };

  const r = await ingestOrders(conn, packages.map(toIncomingOrder));
  return { fetched: packages.length, created: r.created, duplicates: r.duplicates, unmapped: r.unmapped };
}
