// lib/courier/status.ts — Dış kurye işlerinin durumunu (kurye adı, ETA, tahsilat) tazeler.
// Kasa panosu courier_jobs satırlarını okur; ağ isteği DB işlemi dışında yapılır.
import { and, eq, lt, notInArray } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { courierStatus } from "./send";
import { ynrConfig } from "./ynr";

/** Bu durumlardan sonra tekrar sormaya gerek yok. */
const TERMINAL = ["delivered", "cancelled", "failed", "unsupported"];
const REFRESH_AFTER_MS = 2 * 60_000;

export async function refreshCourierJobs(now = new Date()): Promise<{ checked: number; updated: number; failed: number }> {
  if (!ynrConfig()) return { checked: 0, updated: 0, failed: 0 };
  const J = schema.courierJobs;
  const tenants = await getDb().select({ id: schema.tenants.id }).from(schema.tenants);
  let checked = 0, updated = 0, failed = 0;

  for (const tenant of tenants) {
    const due = await withTenant(tenant.id, (tx) => tx.select({ tabId: J.tabId }).from(J).where(and(
      notInArray(J.status, TERMINAL),
      lt(J.updatedAt, new Date(now.getTime() - REFRESH_AFTER_MS)),
    )).limit(200));
    if (!due.length) continue;

    for (const job of due) {
      checked++;
      try {
        const s = await courierStatus(tenant.id, job.tabId);
        if ("error" in s) { failed++; continue; }
        await withTenant(tenant.id, (tx) => tx.update(J)
          .set({ status: s.status, courierName: s.courierName, etaMinutes: s.etaMinutes, collectionMinor: s.collectionMinor, updatedAt: now })
          .where(and(eq(J.tenantId, tenant.id), eq(J.tabId, job.tabId))));
        updated++;
      } catch {
        failed++;
      }
    }
  }
  return { checked, updated, failed };
}
