import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getDevice } from "@/lib/auth/kasa";
import { verifyPin } from "@/lib/auth/pin";
import { signJwt } from "@/lib/auth/jwt";
import { hit } from "@/lib/ratelimit";
import { startCourierPosition } from "@/lib/tabs/courier-location";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const device = await getDevice();
  if (!device || device.role !== "kurye") return Response.json({ error: "Kurye cihazı gerekli." }, { status: 403, headers });
  // Next may use an internal localhost origin behind a proxy; compare the public app origin.
  const origin = req.headers.get("origin");
  const expected = new URL(process.env.APP_URL || req.url).origin;
  if (origin !== expected) return Response.json({ error: "Kaynak doğrulanamadı." }, { status: 403, headers });
  if (await hit(`courier-location-pin:${device.id}`, 1) > 10) return Response.json({ error: "Çok fazla PIN denemesi. Bir dakika bekleyin." }, { status: 429, headers });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.staffId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.staffId) || typeof body.pin !== "string" || !/^\d{4,6}$/.test(body.pin)) return Response.json({ error: "PIN doğrulanamadı." }, { status: 400, headers });
  const [staff] = await withTenant(device.tenantId, tx => tx.select({ pinHash: schema.staff.pinHash }).from(schema.staff).where(and(eq(schema.staff.tenantId, device.tenantId), eq(schema.staff.id, body.staffId), eq(schema.staff.active, true), eq(schema.staff.role, "kurye"))));
  if (!staff || !await verifyPin(body.pin, staff.pinHash)) return Response.json({ error: "PIN doğrulanamadı." }, { status: 403, headers });
  const sid = crypto.randomUUID();
  await startCourierPosition({ tenantId: device.tenantId, storeId: device.storeId, deviceId: device.id, staffId: body.staffId, sessionId: sid });
  const token = await signJwt("courier-location", { sub: body.staffId, tid: device.tenantId, did: device.id, stid: device.storeId, sid }, 1800);
  return Response.json({ token, expiresAt: Date.now() + 1800000 }, { headers });
}
