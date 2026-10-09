// Platform sipariş webhook'u: POST /api/platform/<platform>/webhook?t=<bağlantı jetonu> (#30; eski ?c=<id> geçerliliğini korur).
// İmza/biçim adaptörde doğrulanır; aynı sipariş ikinci kez gelirse 200 döner, yazılmaz (platform yeniden dener).
import { connectionById, connectionByToken, sourceFor } from "@/lib/platform";
import { ingestOrders } from "@/lib/platform/ingest";
import { audit as auditLog } from "@/lib/audit";
import { hit } from "@/lib/ratelimit";
import { withTenant } from "@/db";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const source = sourceFor(platform);
  const q = new URL(req.url).searchParams;
  const conn = source ? (await connectionByToken(q.get("t") ?? "", platform)) ?? (await connectionById(q.get("c") ?? "", platform)) : null;
  if (!source || !conn) return Response.json({ error: "Bağlantı bulunamadı." }, { status: 404 });
  // Bağlantı başına hız sınırı: taşma suistimali/döngü hatasına karşı (tek POST 50 sipariş taşır; 60/dk boldur).
  if ((await hit(`platform-hook:${conn.id}`, 1)) > 60) return Response.json({ error: "Çok fazla istek." }, { status: 429, headers: noStore });
  const raw = await req.text();
  if (raw.length > 1_000_000) return Response.json({ error: "Gövde çok büyük." }, { status: 413 });
  const parsed = source.parseWebhook(raw, req.headers, conn);
  if (!Array.isArray(parsed)) return Response.json({ error: parsed.error }, { status: parsed.status });
  const result = await ingestOrders(conn, parsed);
  await withTenant(conn.tenantId, (tx) => auditLog(tx, conn.tenantId, `platform:${conn.platform}`, "platform.webhook", result));
  return Response.json({ ok: true, ...result });
}
