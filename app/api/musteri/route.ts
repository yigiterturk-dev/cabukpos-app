// Kasa müşteri araması: GET /api/musteri?tel=05321234567. Kimlik: cihaz çerezi.
import { getDevice } from "@/lib/auth/kasa";
import { lookupCustomer } from "@/lib/delivery/customers";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  const r = await lookupCustomer(device.tenantId, device.storeId, new URL(req.url).searchParams.get("tel") ?? "");
  if (!r) return Response.json({ error: "Telefon numarası geçersiz." }, { status: 400, headers: noStore });
  return Response.json(r, { headers: noStore });
}
