import { getDevice } from "@/lib/auth/kasa";
import { deliveryHistory } from "@/lib/tabs/delivery-history";
import { isValidCalendarDay, istToday } from "@/lib/core/report";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const device = await getDevice();
  if (!device) return Response.json({ error: "Kasa eşlemesi gerekli." }, { status: 401, headers });
  if (device.role !== "kasa") return Response.json({ error: "Bu rapor kasa ekranına özeldir." }, { status: 403, headers });
  const day = new URL(req.url).searchParams.get("day") ?? "";
  if (!isValidCalendarDay(day) || day > istToday() || day < istToday(Date.now(), -366)) return Response.json({ error: "Son bir yıl içinden geçerli bir gün seçin." }, { status: 400, headers });
  try { return Response.json({ tabs: await deliveryHistory(device, day), day }, { headers }); }
  catch { return Response.json({ error: "Sipariş geçmişi yüklenemedi. Daha sonra tekrar deneyin." }, { status: 503, headers }); }
}
