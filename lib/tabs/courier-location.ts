import { and, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { LOCATION_EXPIRE_MS, type CourierPosition } from "@/lib/core/courier-location";
import { parseCourierPosition } from "@/lib/core/courier-location";

export type LocationActor = { tenantId: string; storeId: string; deviceId: string; staffId: string; sessionId: string };
const L = schema.courierLocations;
export async function startCourierPosition(actor: LocationActor) {
  return withTenant(actor.tenantId, tx => tx.insert(L).values({ ...actor, active: false, latitudeE6: 0, longitudeE6: 0, accuracy: 0, observedAt: new Date(0) }).onConflictDoUpdate({ target: [L.tenantId, L.storeId, L.staffId], set: { deviceId: actor.deviceId, sessionId: actor.sessionId, active: false, observedAt: new Date(0), latitudeE6: 0, longitudeE6: 0, accuracy: 0 } }));
}
export async function saveCourierPosition(actor: LocationActor, input: unknown, now = Date.now()) {
  const point = parseCourierPosition(input, now);
  if (!point) return false;
  return withTenant(actor.tenantId, async tx => {
    const [staff] = await tx.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.id, actor.staffId), eq(schema.staff.tenantId, actor.tenantId), eq(schema.staff.role, "kurye"), eq(schema.staff.active, true)));
    const [device] = await tx.select({ id: schema.devices.id }).from(schema.devices).where(and(eq(schema.devices.id, actor.deviceId), eq(schema.devices.tenantId, actor.tenantId), eq(schema.devices.storeId, actor.storeId), eq(schema.devices.role, "kurye"), isNull(schema.devices.revokedAt)));
    if (!staff || !device) return false;
    // Updates only: a stopped session cannot recreate its point via an in-flight POST.
    const updated = await tx.update(L).set({ ...point, active: true }).where(and(eq(L.tenantId, actor.tenantId), eq(L.storeId, actor.storeId), eq(L.staffId, actor.staffId), eq(L.deviceId, actor.deviceId), eq(L.sessionId, actor.sessionId), lte(L.observedAt, point.observedAt))).returning({ staffId: L.staffId });
    return updated.length === 1;
  });
}
export function stopCourierPosition(actor: LocationActor) {
  return withTenant(actor.tenantId, tx => tx.delete(L).where(and(eq(L.tenantId, actor.tenantId), eq(L.storeId, actor.storeId), eq(L.staffId, actor.staffId), eq(L.deviceId, actor.deviceId), eq(L.sessionId, actor.sessionId))));
}
export function loadCourierPositions(ctx: { tenantId: string; storeId: string }, now = Date.now()): Promise<CourierPosition[]> {
  return withTenant(ctx.tenantId, async tx => {
    // Expired points are removed from this branch; no historic trail is retained.
    const scope = and(eq(L.tenantId, ctx.tenantId), eq(L.storeId, ctx.storeId));
    await tx.delete(L).where(and(scope, eq(L.active, true), lt(L.observedAt, new Date(now - LOCATION_EXPIRE_MS))));
    const rows = await tx.select({ staffId: L.staffId, latitude: L.latitudeE6, longitude: L.longitudeE6, accuracy: L.accuracy, observedAt: L.observedAt }).from(L).innerJoin(schema.staff, and(eq(schema.staff.id, L.staffId), eq(schema.staff.tenantId, ctx.tenantId), eq(schema.staff.active, true), eq(schema.staff.role, "kurye"))).where(and(scope, eq(L.active, true), gte(L.observedAt, new Date(now - LOCATION_EXPIRE_MS))));
    return rows.map(r => ({ ...r, latitude: r.latitude / 1000000, longitude: r.longitude / 1000000, observedAt: r.observedAt.toISOString() }));
  });
}
