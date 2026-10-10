// Garson çağrısı: POST /api/menu/call — gövde { storeId, secret, tableId, note? }.
// Menü URL'sindeki k sırrı doğrulanır; masa başına açık çağrı tektir (tekrar çağrı sessizce yutulur).
import { z } from "zod";
import { callWaiter } from "@/lib/call";
import { clientIp, hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().regex(/^[0-9a-f-]{36}$/i),
  secret: z.string().min(8).max(200),
  tableId: z.string().regex(/^[0-9a-f-]{36}$/i),
  note: z.string().trim().max(200).nullable().default(null),
});

export async function POST(req: Request) {
  if ((await hit(`call:${await clientIp()}`, 1)) > 5) return Response.json({ error: "Çok fazla istek." }, { status: 429 });
  let json: unknown;
  try { json = await req.json(); } catch { return Response.json({ error: "JSON değil." }, { status: 400 }); }
  const p = bodySchema.safeParse(json);
  if (!p.success) return Response.json({ error: "Biçim hatalı." }, { status: 400 });
  const r = await callWaiter(p.data.storeId, p.data.secret, p.data.tableId, p.data.note);
  if (!r.ok) return Response.json({ error: r.reason }, { status: r.reason === "Kiosko kapalı." ? 404 : 400 });
  return Response.json({ ok: true });
}
