import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getDevice } from "@/lib/auth/kasa";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const device = await getDevice();
  if (!device || device.role !== "kasa") return Response.json({ error: "Kasa cihazı gerekli." }, { status: 403, headers });
  const P = schema.platformConnections;
  // This identity table has no RLS: both tenant AND branch predicates are mandatory.
  const connections = await getDb().select({ platform: P.platform, active: P.active, autoAccept: P.autoAccept }).from(P).where(and(eq(P.tenantId, device.tenantId), eq(P.storeId, device.storeId)));
  return Response.json({ connections }, { headers });
}
