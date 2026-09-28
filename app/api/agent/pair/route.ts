// Ajan eşleme: yönetimde üretilen 8 haneli kod → ajan jetonu + hubKey. IP başına sınırlı.
import { pairAgent } from "@/lib/agent/registry";
import { clientIp, hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if ((await hit(`agent-pair:${await clientIp()}`, 60)) > 10) return Response.json({ error: "Çok fazla deneme; bir saat sonra tekrar deneyin." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const r = typeof body?.code === "string" ? await pairAgent(body.code.trim().toUpperCase()) : null;
  if (!r) return Response.json({ error: "Kod geçersiz ya da süresi dolmuş." }, { status: 400 });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
