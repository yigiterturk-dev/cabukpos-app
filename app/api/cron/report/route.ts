// #41: Zamanlanmış rapor e-postası (Vercel Cron, sabah). Ayarlar Raporlar sayfasında açılır.
import { dueReportTenants, sendReportMail } from "@/lib/admin/report-mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  const sent = { gunluk: 0, haftalik: 0, aylik: 0 };
  for (const id of await dueReportTenants("gunluk")) if ((await sendReportMail(id, "gunluk")).ok) sent.gunluk++;
  // Haftalık yalnız pazartesi (İstanbul) denenir; ayar o gün açıldıysa bile ilk postası pazartesi gider.
  const ist = new Date(Date.now() + 3 * 3_600_000);
  if (ist.getUTCDay() === 1) for (const id of await dueReportTenants("haftalik")) if ((await sendReportMail(id, "haftalik")).ok) sent.haftalik++;
  // #43 aylık konsolide: ayın 1'i (İstanbul).
  if (ist.getUTCDate() === 1) for (const id of await dueReportTenants("aylik")) if ((await sendReportMail(id, "aylik")).ok) sent.aylik++;
  return Response.json(sent, { headers: { "Cache-Control": "no-store" } });
}
