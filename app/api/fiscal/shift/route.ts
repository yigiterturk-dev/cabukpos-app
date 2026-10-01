// Kasa gün sonu: vardiyada kesilemeyen (error) e-Arşiv sayısı.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getDevice as requireAuthDevice } from "@/lib/auth/kasa";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const device = await requireAuthDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  const shiftId = new URL(req.url).searchParams.get("shiftId") ?? "";
  if (!UUID.test(shiftId)) return Response.json({ error: "shiftId" }, { status: 400 });
  const [r] = await withTenant(device.tenantId, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(schema.fiscalDocuments)
    .innerJoin(schema.sales, eq(schema.sales.id, schema.fiscalDocuments.saleId))
    .where(and(eq(schema.sales.shiftId, shiftId), eq(schema.sales.deviceId, device.id), eq(schema.fiscalDocuments.status, "error"))));
  return Response.json({ errors: r.n }, { headers: { "Cache-Control": "no-store" } });
}
