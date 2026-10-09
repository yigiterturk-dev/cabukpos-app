// lib/platform/catalog-cron.ts — Saatlik katalog/stok push'u (#29 tetiği). Eşlenmiş ürünü olan aktif
// platform bağlantılarına menü/fiyat/stok gönderir; bağlantı başına pencere: son denemeden bu yana ~1 saat.
// Kapalı/desteklemeyen adaptör ağa çıkmaz (adaptörün içinde); cron penceresi yine de işaretlenir.
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sourceFor } from "./index";
import { pushStoreCatalog } from "./outbound";

export const CATALOG_PUSH_MINUTES = 55;

/** Vadesi gelen bağlantılar için push dener; {ok, failed} sayar. Hata sayılır ama kuyruğu bloklamaz. */
export async function pushDueCatalogs(now = new Date()): Promise<{ due: number; ok: number; failed: number }> {
  const P = schema.platformConnections;
  const cutoff = new Date(now.getTime() - CATALOG_PUSH_MINUTES * 60_000);
  const conns = await getDb().select().from(P).where(and(eq(P.active, true), or(isNull(P.lastCatalogPushAt), lt(P.lastCatalogPushAt, cutoff))));
  let ok = 0, failed = 0;
  for (const c of conns) {
    if (!sourceFor(c.platform)?.pushCatalog) continue; // kiosk vb. — push kavramı yok
    await getDb().update(P).set({ lastCatalogPushAt: now }).where(eq(P.id, c.id)); // pencereyi başarısızlıkta da kapat: saatte bir dener
    const r = await pushStoreCatalog(c.tenantId, c.storeId, c.platform, "cron").catch(() => ({ error: "exception" as const }));
    if ("error" in r) failed++;
    else ok++;
  }
  return { due: conns.length, ok, failed };
}
