// Saatlik kurye sevki tekrarı: hazır ama gönderilememiş paketleri YNR'ye yeniden iletir (idempotent).
import { redispatchPending } from "@/lib/courier/retry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  return Response.json(await redispatchPending());
}
