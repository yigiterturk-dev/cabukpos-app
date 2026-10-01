// Ajan heartbeat: durum yukarı, yapılandırma + iptal edilmiş cihazlar aşağı.
import { heartbeatBody } from "@/lib/agent/config";
import { agentFromRequest, recordHeartbeat } from "@/lib/agent/registry";
import { dispatchAlert } from "@/lib/observability/alerts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const agent = await agentFromRequest(req);
  if (!agent) return Response.json({ error: "ajan" }, { status: 401 });
  const hb = heartbeatBody.safeParse(await req.json().catch(() => null));
  if (!hb.success) return Response.json({ error: "gövde" }, { status: 400 });
  const result = await recordHeartbeat(agent, hb.data);
  if (hb.data.failed > 0) await dispatchAlert("agent.heartbeat.failed", { agentId: agent.id, tenantId: agent.tenantId, failed: hb.data.failed, version: hb.data.version });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
