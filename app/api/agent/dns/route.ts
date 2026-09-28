// Ajan sertifikası (DNS-01): ajan yalnız KENDİ adına A (LAN IP) ve _acme-challenge TXT yazdırır. Sağlayıcı yoksa 501.
import { z } from "zod";
import { agentFromRequest } from "@/lib/agent/registry";
import { agentHost, challengeHost, dnsProvider } from "@/lib/agent/dns";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("A"), value: z.ipv4().refine((ip) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip), "özel ağ") }),
  z.object({ type: z.literal("TXT"), value: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).nullable() }),
]);

export async function POST(req: Request) {
  const agent = await agentFromRequest(req);
  if (!agent) return Response.json({ error: "ajan" }, { status: 401 });
  const dns = dnsProvider();
  if (!dns) return Response.json({ error: "DNS sağlayıcısı yok" }, { status: 501 });
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "gövde" }, { status: 400 });
  const name = b.data.type === "A" ? agentHost(agent.id) : challengeHost(agent.id);
  await dns.set(b.data.type, name, b.data.value);
  return Response.json({ name: agentHost(agent.id) });
}
