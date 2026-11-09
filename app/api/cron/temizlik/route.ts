// app/api/cron/temizlik/route.ts — saklama süresi temizliği (KVKK m.7).
// Süresi dolan oturumları, deneme sayaçlarını ve eski denetim kayıtlarını siler.
// Zamanlama Vercel Cron ya da harici zamanlayıcıdan: Authorization: Bearer $CRON_SECRET
import { lt } from "drizzle-orm";

import { getDb, schema, withTenant } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GUN = 24 * 60 * 60 * 1000;
const once = (gun: number) => new Date(Date.now() - gun * GUN);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });

  const db = getDb();

  const silinenOturum = (
    await db.delete(schema.sessions).where(lt(schema.sessions.lastSeenAt, once(90))).returning({ id: schema.sessions.id })
  ).length;

  const silinenDeneme = (
    await db.delete(schema.loginAttempts).where(lt(schema.loginAttempts.since, once(7))).returning({ key: schema.loginAttempts.key })
  ).length;

  // audit_log RLS'li: kiracı bağlamında silinir. 2 yıl (730 gün) saklanır.
  const kiraclar = await db.select({ id: schema.tenants.id }).from(schema.tenants);
  let silinenDenetim = 0;
  for (const t of kiraclar) {
    silinenDenetim += await withTenant(t.id, async (tx) =>
      (await tx.delete(schema.auditLog).where(lt(schema.auditLog.createdAt, once(730))).returning({ id: schema.auditLog.id })).length,
    );
  }

  return Response.json({ ok: true, silinenOturum, silinenDeneme, silinenDenetim, kirac: kiraclar.length });
}
