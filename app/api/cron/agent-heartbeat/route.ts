// Vercel Cron: sessiz ajan alarmları. Pair'li ama heartbeat göndermeyen ajanları
// AGENT_ALERT_WEBHOOK_URL'e bildirir. Checklist: "başarısız heartbeat alarmı görüldü".
import { dispatchAlert } from "@/lib/observability/alerts";
import { silentAgents } from "@/lib/observability/heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  const stale = await silentAgents();
  for (const agent of stale) {
    await dispatchAlert("agent.heartbeat.stale", { agentId: agent.id, tenantId: agent.tenantId, lastSeenAt: agent.lastSeenAt?.toISOString() ?? null });
  }
  return Response.json({ alerted: stale.length });
}
