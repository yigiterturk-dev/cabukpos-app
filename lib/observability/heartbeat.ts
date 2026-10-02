// lib/observability/heartbeat.ts — sessiz ajan tespiti: pair'li ama heartbeat göndermeyen ajanlar.
// Alarm penceresi: sessizlik STALE ile STALE+WINDOW dakika arasındayken listelenir; cron dakikada bir
// çalışsa bile aynı sessizlik bölümü için sınırlı sayıda alarm çıkar (spam önleme).
import { and, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";

const minutes = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function heartbeatWindow(): { staleAfter: Date; alertUntil: Date } {
  const stale = minutes(process.env.HEARTBEAT_STALE_MINUTES, 15);
  const window = minutes(process.env.HEARTBEAT_ALERT_WINDOW_MINUTES, 60);
  const now = Date.now();
  return {
    staleAfter: new Date(now - stale * 60_000),
    alertUntil: new Date(now - (stale + window) * 60_000),
  };
}

/** Pair'li, iptal edilmemiş ajanlardan heartbeat'i susmuş olanlar (hiç görülmeyenler dahil). */
export async function silentAgents(): Promise<{ id: string; tenantId: string; lastSeenAt: Date | null }[]> {
  const a = schema.agents;
  const { staleAfter, alertUntil } = heartbeatWindow();
  return getDb().select({ id: a.id, tenantId: a.tenantId, lastSeenAt: a.lastSeenAt }).from(a)
    .where(and(
      isNotNull(a.pairedAt),
      isNull(a.revokedAt),
      isNotNull(a.hubKeyEnc),
      or(
        and(isNotNull(a.lastSeenAt), lte(a.lastSeenAt, staleAfter), gte(a.lastSeenAt, alertUntil)),
        and(isNull(a.lastSeenAt), lte(a.pairedAt, staleAfter), gte(a.pairedAt, alertUntil)),
      ),
    ));
}
