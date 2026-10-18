// Kiosko siparişi: POST /api/kiosk — gövde { storeId, secret, name?, phone?, note?, payIntent, lines }.
// Menü URL'sindeki k sırrı doğrulanır; sipariş platform hattındaki gibi tab olaylarına düşer.
import { z } from "zod";
import { kioskConn, kioskOrder } from "@/lib/kiosk";
import { clientIp, hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().regex(/^[0-9a-f-]{36}$/i),
  secret: z.string().min(8).max(200),
  requestId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60).default("Kiosk müşterisi"),
  phone: z.string().trim().max(20).default(""),
  note: z.string().trim().max(300).nullable().default(null),
  payIntent: z.enum(["nakit", "kart", "yemek_karti", "online"]).default("nakit"),
  lines: z.array(z.object({ productId: z.string().regex(/^[0-9a-f-]{36}$/i), qtyMilli: z.number().int().min(1).max(100_000), note: z.string().trim().max(200).nullable().default(null) })).min(1).max(50),
});

export async function POST(req: Request) {
  if ((await hit(`kiosk:${await clientIp()}`, 1)) > 10) return Response.json({ error: "Çok fazla istek." }, { status: 429 });
  let json: unknown;
  try { json = await req.json(); } catch { return Response.json({ error: "JSON değil." }, { status: 400 }); }
  const p = bodySchema.safeParse(json);
  if (!p.success) return Response.json({ error: "Biçim hatalı." }, { status: 400 });
  const conn = await kioskConn(p.data.storeId, p.data.secret);
  if (!conn) return Response.json({ error: "Kiosko kapalı." }, { status: 404 });
  const r = await kioskOrder(conn, p.data);
  if (!r.ok) return Response.json({ error: r.reason }, { status: 400 });
  return Response.json({ ok: true, tabId: r.tabId });
}
