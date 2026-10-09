// Saatlik platform katalog/stok push'u (Vercel Cron + GH Actions). Eşlenmiş ürünü olan aktif bağlantılara
// menü/fiyat/stok gönderir; pencere bağlantı başına ~1 saat (lib/platform/catalog-cron.ts).
import { pushDueCatalogs } from "@/lib/platform/catalog-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  const r = await pushDueCatalogs();
  return Response.json(r);
}
