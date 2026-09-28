// Giden kutusu yukarı: FIFO parti, belge başına sonuç. Aynı belge tekrar gelirse ikinci kayıt oluşmaz.
import { getDevice } from "@/lib/auth/kasa";
import { applyDoc } from "@/lib/sync/apply";
import { PUSH_BATCH, type DocResult } from "@/lib/sync/docs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { deviceId?: unknown; docs?: unknown } | null;
  if (!body || !Array.isArray(body.docs) || body.docs.length > PUSH_BATCH) return Response.json({ error: "parti" }, { status: 400 });
  // Tarayıcı başka cihaz olarak yeniden eşlendiyse eski cihazın belgeleri yeni cihaza yazılmasın.
  if (body.deviceId !== device.id) return Response.json({ error: "eşleme değişti" }, { status: 409 });
  const ctx = { tenantId: device.tenantId, storeId: device.storeId, deviceId: device.id, receiptPrefix: device.receiptPrefix };
  const results: DocResult[] = [];
  for (const doc of body.docs) results.push(await applyDoc(ctx, doc));
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
