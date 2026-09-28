// Platform sipariş webhook'u: POST /api/platform/<platform>/webhook?c=<bağlantı kimliği>.
// İmza/biçim adaptörde doğrulanır; aynı sipariş ikinci kez gelirse 200 döner, yazılmaz (platform yeniden dener).
import { connectionById, sourceFor } from "@/lib/platform";
import { ingestOrders } from "@/lib/platform/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const source = sourceFor(platform);
  const conn = source ? await connectionById(new URL(req.url).searchParams.get("c") ?? "", platform) : null;
  if (!source || !conn) return Response.json({ error: "Bağlantı bulunamadı." }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return Response.json({ error: "Gövde çok büyük." }, { status: 413 });
  const parsed = source.parseWebhook(raw, req.headers, conn);
  if (!Array.isArray(parsed)) return Response.json({ error: parsed.error }, { status: parsed.status });
  return Response.json({ ok: true, ...(await ingestOrders(conn, parsed)) });
}
