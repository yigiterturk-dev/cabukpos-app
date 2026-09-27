// Kasa kimliği: cihaz (cz_device, eşlemede verilen jeton; DB'de yalnız sha256'sı) + kasiyer (cz_cashier JWT, 12 saat).
import { cookies } from "next/headers";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { sha256 } from "./tokens";
import { signJwt, verifyJwt } from "./jwt";

export const DEVICE_COOKIE = "cz_device";
export const CASHIER_COOKIE = "cz_cashier";
const CASHIER_SECONDS = 12 * 3600;
const secure = process.env.NODE_ENV === "production";

export type Device = { id: string; tenantId: string; storeId: string; name: string; receiptPrefix: string; tenantName: string; vertical: "restoran" | "market" };

export async function getDevice(): Promise<Device | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const d = schema.devices, t = schema.tenants;
  const [row] = await getDb()
    .select({ id: d.id, tenantId: d.tenantId, storeId: d.storeId, name: d.name, receiptPrefix: d.receiptPrefix, tenantName: t.name, vertical: t.vertical })
    .from(d).innerJoin(t, eq(t.id, d.tenantId))
    .where(and(eq(d.tokenHash, await sha256(token)), isNull(d.revokedAt)));
  if (!row) return null;
  await getDb().update(d).set({ lastSeenAt: sql`now()` }).where(and(eq(d.id, row.id), or(isNull(d.lastSeenAt), lt(d.lastSeenAt, sql`now() - interval '5 minutes'`))));
  return row;
}

export async function setDeviceCookie(token: string) {
  (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
}

export async function setCashier(staffId: string, device: Device) {
  (await cookies()).set(CASHIER_COOKIE, await signJwt("cashier", { staffId, deviceId: device.id, tenantId: device.tenantId }, CASHIER_SECONDS), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: CASHIER_SECONDS });
}

export async function clearCashier() {
  (await cookies()).delete(CASHIER_COOKIE);
}

/** Bu cihazda PIN ile girmiş, hâlâ aktif kasiyer. */
export async function getCashier(device: Device): Promise<{ staffId: string; name: string; role: "kasiyer" | "mudur" } | null> {
  const p = await verifyJwt("cashier", (await cookies()).get(CASHIER_COOKIE)?.value);
  if (!p || p.deviceId !== device.id || p.tenantId !== device.tenantId || typeof p.staffId !== "string") return null;
  const staffId = p.staffId;
  const [s] = await withTenant(device.tenantId, (tx) => tx.select({ name: schema.staff.name, role: schema.staff.role, active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.id, staffId)));
  return s?.active ? { staffId, name: s.name, role: s.role } : null;
}
