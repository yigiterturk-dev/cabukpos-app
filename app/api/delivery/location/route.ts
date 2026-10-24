import { getDevice } from "@/lib/auth/kasa";
import { verifyJwt } from "@/lib/auth/jwt";
import { hit } from "@/lib/ratelimit";
import { loadCourierPositions, saveCourierPosition, stopCourierPosition, type LocationActor } from "@/lib/tabs/courier-location";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  const device = await getDevice();
  if (!device || device.role !== "kasa") return Response.json({ error: "Kasa cihazı gerekli." }, { status: 403, headers });
  try { return Response.json({ positions: await loadCourierPositions(device) }, { headers }); }
  catch { return Response.json({ error: "Konum bilgisi yüklenemedi." }, { status: 503, headers }); }
}
async function actor(req: Request): Promise<LocationActor | null> {
  const device = await getDevice();
  if (!device || device.role !== "kurye") return null;
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const proof = await verifyJwt("courier-location", token);
  if (!proof || proof.did !== device.id || proof.tid !== device.tenantId || proof.stid !== device.storeId || typeof proof.sub !== "string" || typeof proof.sid !== "string" || !/^[0-9a-f-]{36}$/i.test(proof.sub) || !/^[0-9a-f-]{36}$/i.test(proof.sid)) return null;
  return { tenantId: device.tenantId, storeId: device.storeId, deviceId: device.id, staffId: proof.sub, sessionId: proof.sid };
}
export async function POST(req: Request) {
  const who = await actor(req);
  if (!who) return Response.json({ error: "Konum oturumu doğrulanamadı; tekrar başlatın." }, { status: 403, headers });
  if (await hit(`courier-location:${who.deviceId}`, 1) > 8) return Response.json({ error: "Konum çok sık gönderiliyor." }, { status: 429, headers });
  try {
    const ok = await saveCourierPosition(who, await req.json().catch(() => null));
    return Response.json(ok ? { ok: true } : { error: "Konum veya kurye bilgisi geçersiz." }, { status: ok ? 200 : 400, headers });
  } catch { return Response.json({ error: "Konum kaydedilemedi." }, { status: 503, headers }); }
}
export async function DELETE(req: Request) {
  const who = await actor(req);
  if (!who) return Response.json({ error: "Konum oturumu doğrulanamadı." }, { status: 403, headers });
  try { await stopCourierPosition(who); return Response.json({ ok: true }, { headers }); }
  catch { return Response.json({ error: "Konum silinemedi. Kayıt kısa süre sonra zaman aşımına uğrar." }, { status: 503, headers }); }
}
