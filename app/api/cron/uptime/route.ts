// #57: Uptime cron'u. Kendi readiness'sini (DB) ve UPTIME_TARGETS'taki harici hedefleri denetler;
// sorun varsa ops webhook'una alarm düşer. Vercel Cron otomatik Bearer CRON_SECRET gönderir.
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { dispatchAlert } from "@/lib/observability/alerts";
import { parseTargets, runUptimeChecks } from "@/lib/observability/uptime";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  const summary = await runUptimeChecks({
    self: async () => {
      await getDb().execute(sql`select 1`);
      return true;
    },
    targets: parseTargets(process.env.UPTIME_TARGETS),
  });
  if (!summary.ok) {
    await dispatchAlert("uptime.down", { self: summary.self, failed: summary.results.filter((r) => !r.ok) });
  }
  return Response.json(summary, { status: summary.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
