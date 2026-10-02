// lib/observability/fiscal-backlog.ts — mali belge birikimi eşik kararı ve uyarısı.
import { inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { dispatchAlert } from "./alerts";

export const BACKLOG_GUN_ESIK = 2; // 2 günden eski bekleyen belge alarm
export const BACKLOG_ADET_ESIK = 20; // kiracı başı 20'den çok bekleyen belge alarm

/** Saf eşik kararı: gun = en eski bekleyen belgenin yaşı (gün). */
export function backlogAlarm(kiraciBasiBekleyen: number, gun: number): boolean {
  return gun > BACKLOG_GUN_ESIK || kiraciBasiBekleyen > BACKLOG_ADET_ESIK;
}

/** Kiracıyı kiracı bağlamında ölçer, eşiği aşarsa mevcut webhook kanalına uyarı yollar. */
export async function backlogKontrol(tenantId: string): Promise<void> {
  const D = schema.fiscalDocuments;
  const [s] = await withTenant(tenantId, (tx) => tx.select({
    n: sql<number>`count(*)::int`,
    eskiGun: sql<number>`coalesce(floor(extract(epoch from (now() - min(${D.createdAt}))) / 86400), 0)::int`,
  }).from(D).where(inArray(D.status, ["pending", "error"])));
  const bekleyen = s?.n ?? 0, gun = s?.eskiGun ?? 0;
  if (backlogAlarm(bekleyen, gun)) await dispatchAlert("fiscal_backlog", { tenantId, bekleyen, eskiGun: gun });
}
