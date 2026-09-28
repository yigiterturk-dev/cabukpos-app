// İade için fiş sorgusu: ?no=K1-000042 → satış + iade edilebilir satırlar. Kimlik: cihaz çerezi.
import { getDevice } from "@/lib/auth/kasa";
import { lookupSale } from "@/lib/sync/lookup";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  const no = (new URL(req.url).searchParams.get("no") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}-\d{6}(-\d+)?$/.test(no)) return Response.json({ error: "fiş no" }, { status: 400, headers: noStore });
  const sale = await lookupSale(device.tenantId, no);
  return sale ? Response.json(sale, { headers: noStore }) : Response.json({ error: "yok" }, { status: 404, headers: noStore });
}
