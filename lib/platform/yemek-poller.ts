// lib/platform/yemek-poller.ts — Trendyol Yemek siparişlerini polling ile içeri alır.
// Dokümanda POS'a webhook yok; `GET .../packages` tek kaynak. Aynı paket ikinci kez yazılmaz (ingestOrders tekilleştirir).
import { createYemekClient, parsePackages, toIncomingOrder } from "./trendyol-yemek";
import { ingestOrders } from "./ingest";
import type { Conn } from "./types";

/** Yeni paketler "Created" durumunda gelir. TRENDYOL_YEMEK_IMPORT_STATUSES ile (test) geçmiş durumlar da alınır. */
const NEW_STATUSES = "Created";
const MAX_PAGES = 20;

export type PollResult = { fetched: number; created: number; duplicates: number; unmapped: number } | { error: string };

function connection(env: NodeJS.ProcessEnv): Conn | null {
  const tenantId = env.TRENDYOL_YEMEK_TENANT_ID?.trim();
  // ÇabukPOS mağaza kimliği (uuid) — Trendyol'un mağaza numarası DEĞİL.
  const storeId = env.TRENDYOL_YEMEK_POS_STORE_ID?.trim();
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
  if (!conn) return { error: "TRENDYOL_YEMEK_TENANT_ID veya TRENDYOL_YEMEK_POS_STORE_ID eksik." };

  const statuses = env.TRENDYOL_YEMEK_IMPORT_STATUSES?.trim() || NEW_STATUSES;
  const wanted = new Set(statuses.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  const all: ReturnType<typeof parsePackages> = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const raw = await createYemekClient().fetchPackages(statuses, page);
      const got = parsePackages(raw);
      all.push(...got);
      const totalPages = Number((raw as { totalPages?: unknown })?.totalPages ?? 1);
      if (got.length < 50 || page + 1 >= totalPages) break;
    }
  } catch (e) {
    if (!all.length) return { error: e instanceof Error ? e.message : "Trendyol Yemek'e ulaşılamadı." };
  }
  const packages = all.filter((p) => wanted.has(p.status.toUpperCase()));
  if (!packages.length) return { fetched: 0, created: 0, duplicates: 0, unmapped: 0 };

  const r = await ingestOrders(conn, packages.map(toIncomingOrder));
  return { fetched: packages.length, created: r.created, duplicates: r.duplicates, unmapped: r.unmapped };
}
