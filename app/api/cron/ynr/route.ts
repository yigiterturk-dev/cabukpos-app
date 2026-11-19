// YNR kurye durum senkronu (polling). CRON_SECRET ile korunur.
import { syncYnrStatuses } from "@/lib/delivery/ynr-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  return Response.json(await syncYnrStatuses());
}
