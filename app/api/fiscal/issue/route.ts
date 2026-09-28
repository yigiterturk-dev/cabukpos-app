// Kasa satışı eşitledikten hemen sonra e-Arşiv kesimi ister (kasa en çok 3 sn bekler, sonra fişi basar).
import { getDevice } from "@/lib/auth/kasa";
import { issueOne } from "@/lib/fiscal/issue";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { saleId?: unknown } | null;
  if (typeof body?.saleId !== "string" || !UUID.test(body.saleId)) return Response.json({ error: "saleId" }, { status: 400 });
  const r = await issueOne(device.tenantId, body.saleId).catch(() => null);
  if (!r) return Response.json({ error: "belge yok" }, { status: 404 });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
