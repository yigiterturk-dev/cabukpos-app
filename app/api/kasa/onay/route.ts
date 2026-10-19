// Kasa müdür onayı ve kurye hesap kapatma: PIN sunucuda doğrulanır; yalnız müdür işlemi imzalı belirteç alır.
import { and, eq, inArray } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getDevice as requireAuthDevice } from "@/lib/auth/kasa";
import { verifyPin } from "@/lib/auth/pin";
import { signJwt } from "@/lib/auth/jwt";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const device = await requireAuthDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  // Kimliği doğrulanmış cihaz başına dakikada 10 PIN denemesi.
  if ((await hit(`onay:${device.id}`, 1)) > 10) return Response.json({ error: "Çok fazla istek." }, { status: 429, headers: noStore });
  const body = (await req.json().catch(() => null)) as { staffId?: unknown; pin?: unknown; purpose?: unknown } | null;
  const staffId = typeof body?.staffId === "string" ? body.staffId : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const courierClose = body?.purpose === "courier-close";
  if ((!courierClose && !staffId) || !/^\d{4,6}$/.test(pin)) return Response.json({ error: "PIN doğrulanamadı." }, { status: 400, headers: noStore });
  // RLS staff tablosunda kiracı bağlamı ister — withTenant'sız sorgu boş döner (E2E m6 yakaladı).
  const rows = await withTenant(device.tenantId, (tx) => tx.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, pinHash: schema.staff.pinHash }).from(schema.staff)
    .where(and(eq(schema.staff.tenantId, device.tenantId), eq(schema.staff.active, true), ...(courierClose ? [inArray(schema.staff.role, ["kasiyer", "mudur"])] : [eq(schema.staff.id, staffId)]))));
  const s = courierClose ? (await Promise.all(rows.map(async (row) => await verifyPin(pin, row.pinHash) ? row : null))).find(Boolean) : rows[0];
  // Neden ayrımı yok: personel/PIN/rol — hepsi aynı kapalı yanıt.
  const allowed = courierClose ? s?.role === "mudur" || s?.role === "kasiyer" : s?.role === "mudur";
  if (!s || !allowed || (!courierClose && !(await verifyPin(pin, s.pinHash)))) return Response.json({ error: "PIN doğrulanamadı." }, { status: 403, headers: noStore });
  if (courierClose) return Response.json({ verified: true, staff: { id: s.id, name: s.name, role: s.role } }, { headers: noStore });
  const token = await signJwt("onay", { sub: s.id, tid: device.tenantId, did: device.id }, 600);
  return Response.json({ token }, { headers: noStore });
}
