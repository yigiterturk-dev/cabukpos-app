// Kasa/garson tablet: açık garson çağrıları. GET liste; POST { id } = "Geldim".
// Mutfak/kurye rolleri çağrı panosunu görmez; kasa+garson çözer.
import { getDevice } from "@/lib/auth/kasa";
import { openCalls, resolveCall } from "@/lib/call";

export const dynamic = "force-dynamic";

export async function GET() {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  if (device.role === "mutfak") return Response.json({ error: "rol" }, { status: 403 });
  return Response.json({ calls: await openCalls(device.tenantId, device.storeId) });
}

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  if (device.role === "mutfak" || device.role === "kurye") return Response.json({ error: "rol" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return Response.json({ error: "biçim" }, { status: 400 });
  const ok = await resolveCall(device.tenantId, device.storeId, body.id, `device:${device.id}`);
  return Response.json({ ok }, { status: ok ? 200 : 409 });
}
