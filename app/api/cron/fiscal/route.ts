// Günlük mali yeniden deneme (Vercel Cron). Kiracı listesi SECURITY DEFINER fonksiyonla, iş kiracı bağlamında.
import { pendingTenants, processDue } from "@/lib/fiscal/issue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  const tenants = await pendingTenants();
  for (const t of tenants) await processDue(t, 20).catch(() => {});
  return Response.json({ tenants: tenants.length });
}
