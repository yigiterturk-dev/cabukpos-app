// lib/courier/retry.ts — Hazır olduğu halde kuryeye gönderilememiş paketleri yeniden dener.
// tab_events ve audit_log FORCE RLS'li olduğundan tarama kiracı kiracı yapılır (withTenant).
// YNR aynı (provider, accountId, externalOrderId) için ikinci kayıt açmadığından tekrar gönderim güvenlidir.
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { dispatchToCourier } from "./send";
import { ynrConfig } from "./ynr";

const WINDOW_HOURS = 24;
const MAX_TABS = 200;

export async function redispatchPending(now = new Date()): Promise<{ checked: number; sent: number; failed: number }> {
  if (!ynrConfig()) return { checked: 0, sent: 0, failed: 0 };
  const cutoff = new Date(now.getTime() - WINDOW_HOURS * 3600_000);
  const E = schema.tabEvents, A = schema.auditLog;

  const tenants = await getDb().select({ id: schema.tenants.id }).from(schema.tenants);

  let checked = 0, sent = 0, failed = 0;
  for (const tenant of tenants) {
    const pending = await withTenant(tenant.id, async (tx) => {
      const ready = await tx.selectDistinct({ tabId: E.tabId })
        .from(E)
        .where(and(eq(E.type, "kitchen"), sql`${E.payload}->>'status' = 'hazir'`, gte(E.at, cutoff)))
        .limit(MAX_TABS);
      if (!ready.length) return [];
      const rows = await tx.select({ tabId: sql<string>`${A.detail}->>'tabId'`, failed: sql<boolean>`(${A.detail}->>'error') is not null` })
        .from(A)
        .where(and(eq(A.action, "courier.dispatch"), gte(A.createdAt, new Date(now.getTime() - 30 * 24 * 3600_000))));
      const doneIds = new Set(rows.filter((r) => !r.failed).map((r) => r.tabId));
      // Aynı adisyon için 3'ten fazla başarısız denemeyi bırak: adres çözülemeyen kayıt her saat denenmesin.
      const attempts = new Map<string, number>();
      for (const r of rows) if (r.failed) attempts.set(r.tabId, (attempts.get(r.tabId) ?? 0) + 1);
      return ready.map((r) => r.tabId).filter((id) => !doneIds.has(id) && (attempts.get(id) ?? 0) < 3);
    });

    checked += pending.length;
    for (const tabId of pending) {
      const r = await dispatchToCourier(tenant.id, tabId, "cron");
      // 400 = bu adisyon kuryeye uygun değil (masa/platform/eksik alan); tekrar denemenin anlamı yok.
      if (r.ok) sent++;
      else if (r.status !== 400) failed++;
    }
  }
  return { checked, sent, failed };
}
