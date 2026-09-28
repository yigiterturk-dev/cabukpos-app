// Kasa kimliği: cihaz (cz_device, eşlemede verilen jeton; DB'de yalnız sha256'sı). Kasiyer PIN'i cihazda doğrulanır (M2).
import { cookies } from "next/headers";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sha256 } from "./tokens";

export const DEVICE_COOKIE = "cz_device";
const secure = process.env.NODE_ENV === "production";

export type Device = { id: string; tenantId: string; storeId: string; name: string; receiptPrefix: string; tenantName: string; vertical: "restoran" | "market"; role: "kasa" | "garson" | "mutfak" | "kurye"; stations: string[] };

export async function getDevice(): Promise<Device | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const d = schema.devices, t = schema.tenants;
  const [row] = await getDb()
    .select({ id: d.id, tenantId: d.tenantId, storeId: d.storeId, name: d.name, receiptPrefix: d.receiptPrefix, tenantName: t.name, vertical: t.vertical, role: d.role, stations: d.stations })
    .from(d).innerJoin(t, eq(t.id, d.tenantId))
    .where(and(eq(d.tokenHash, await sha256(token)), isNull(d.revokedAt)));
  if (!row) return null;
  await getDb().update(d).set({ lastSeenAt: sql`now()` }).where(and(eq(d.id, row.id), or(isNull(d.lastSeenAt), lt(d.lastSeenAt, sql`now() - interval '5 minutes'`))));
  return row;
}

export async function setDeviceCookie(token: string) {
  (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
}
