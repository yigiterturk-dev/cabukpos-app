// Dış kurye işlerinin durumunu tazeler (kurye adı, ETA, tahsilat) — kasa panosu bunu okur.
import { refreshCourierJobs } from "@/lib/courier/status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  return Response.json(await refreshCourierJobs());
}
