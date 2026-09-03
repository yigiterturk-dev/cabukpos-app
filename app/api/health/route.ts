// Sağlık kontrolü — dışarıya HİÇBİR sır sızdırmaz.
//
// Neden var: production DATABASE_URL "sensitive" işaretli, yani `vercel env pull` onu
// BOŞ döndürür. Bu yüzden "migration production veritabanına da uygulandı mı?" sorusunu
// yereldeki bağlantıdan cevaplayamıyoruz. Bu uç nokta çalışan uygulamanın kendi
// bağlantısıyla kontrol eder: yalnız "var/yok" bilgisi döner, bağlantı dizesi/host değil.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { messagingEnabled } from "@/lib/messaging";
import { paymentsEnabled } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};

  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "ok";
  } catch {
    checks.db = "hata";
  }

  // rate_limits + rl_hit uygulandı mı? Sayacı kirletmemek için kalıcı olmayan bir
  // anahtarla dener ve hemen siler.
  try {
    const probe = `health:${Math.random().toString(36).slice(2)}`;
    await db.execute(sql`SELECT rl_hit(${probe}, 1, 1000)`);
    await db.execute(sql`SELECT rl_reset(${probe})`);
    checks.rateLimit = "db"; // dağıtık sayaç aktif
  } catch {
    checks.rateLimit = "memory"; // migration uygulanmamış → zayıf geri düşüş
  }

  checks.payments = paymentsEnabled() ? "acik" : "kapali";
  checks.messaging = messagingEnabled() ? "acik" : "kapali";
  checks.cron = process.env.CRON_SECRET ? "acik" : "kapali";

  // Otomatik hatırlatma sorgusu uygulandı mı?
  try {
    await db.execute(sql`SELECT * FROM reminders_due(0) LIMIT 0`);
    checks.reminders = "hazir";
  } catch {
    checks.reminders = "migration-eksik";
  }
  checks.authSecret = (process.env.AUTH_SECRET?.length ?? 0) >= 32 ? "ok" : "eksik";

  const healthy = checks.db === "ok" && checks.authSecret === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "bozuk", checks },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
