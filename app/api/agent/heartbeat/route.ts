// Ajan heartbeat: durum yukarı, yapılandırma + iptal edilmiş cihazlar aşağı.
import { heartbeatBody } from "@/lib/agent/config";
import { agentFromRequest, recordHeartbeat } from "@/lib/agent/registry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const agent = await agentFromRequest(req);
  if (!agent) return Response.json({ error: "ajan" }, { status: 401 });
  const hb = heartbeatBody.safeParse(await req.json().catch(() => null));
  if (!hb.success) return Response.json({ error: "gövde" }, { status: 400 });
  return Response.json(await recordHeartbeat(agent, hb.data), { headers: { "Cache-Control": "no-store" } });
}
