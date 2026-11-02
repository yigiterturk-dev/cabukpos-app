// Kasa/garson tablet: dış kurye (YNR) işlerinin son durumu — panoda rozet olarak gösterilir.
import { and, eq, gte } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getDevice } from "@/lib/auth/kasa";

export const dynamic = "force-dynamic";

export async function GET() {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  if (device.role === "mutfak") return Response.json({ error: "rol" }, { status: 403 });
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await withTenant(device.tenantId, (tx) => tx.select({
    tabId: schema.courierJobs.tabId,
    status: schema.courierJobs.status,
    courierName: schema.courierJobs.courierName,
    etaMinutes: schema.courierJobs.etaMinutes,
    collectionMinor: schema.courierJobs.collectionMinor,
  }).from(schema.courierJobs).where(and(eq(schema.courierJobs.storeId, device.storeId), gte(schema.courierJobs.updatedAt, since))).limit(300));
  return Response.json({ jobs: rows }, { headers: { "cache-control": "private, no-store" } });
}
