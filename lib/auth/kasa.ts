// Kasa kimliği: cihaz (cz_device, eşlemede verilen jeton; DB'de yalnız sha256'sı). Kasiyer PIN'i cihazda doğrulanır (M2).
// #8: jeton rotasyonu — katalog çekiminde 30 günde bir yeni jeton verilir; önceki jeton yeni yazılana dek geçerli kalır.
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { newDeviceToken, sha256 } from "./tokens";

export const DEVICE_COOKIE = "cz_device";
const secure = process.env.NODE_ENV === "production";
const ROTATE_MS = 30 * 86_400_000;

export type Device = { id: string; tenantId: string; storeId: string; name: string; receiptPrefix: string; tenantName: string; vertical: "restoran" | "market"; role: "kasa" | "garson" | "mutfak" | "kurye"; stations: string[] };

const deviceCols = { id: schema.devices.id, tenantId: schema.devices.tenantId, storeId: schema.devices.storeId, name: schema.devices.name, receiptPrefix: schema.devices.receiptPrefix, tenantName: schema.tenants.name, vertical: schema.tenants.vertical, role: schema.devices.role, stations: schema.devices.stations };

export async function getDevice(): Promise<Device | null> {
  const token = (await (await import("next/headers")).cookies()).get(DEVICE_COOKIE)?.value; // dinamik: node testleri de yükleyebilsin
  if (!token) return null;
  const d = schema.devices, t = schema.tenants;
  const hash = await sha256(token);
  const [row] = await getDb()
    .select(deviceCols)
    .from(d).innerJoin(t, eq(t.id, d.tenantId))
    .where(and(or(eq(d.tokenHash, hash), eq(d.prevTokenHash, hash)), isNull(d.revokedAt)));
  if (!row) return null;
  await getDb().update(d).set({ lastSeenAt: sql`now()` }).where(and(eq(d.id, row.id), or(isNull(d.lastSeenAt), lt(d.lastSeenAt, sql`now() - interval '5 minutes'`))));
  return row;
}

/** Rotasyon vadesi geldiyse yeni jeton verir; yalnız route handler'lardan çağrılmalı (çerez yazar). */
export async function rotateDeviceToken(device: Device): Promise<void> {
  const token = await rotateDeviceTokenDb(device.id);
  if (token) await setDeviceCookie(token);
}

/** DB tarafı: vade kontrolü + jeton çevrimi. Yeni jeton döner (vade dolmadıysa null); çerez yazmaz, test edilebilir. */
export async function rotateDeviceTokenDb(deviceId: string): Promise<string | null> {
  const d = schema.devices;
  const [row] = await getDb().select({ tokenRotatedAt: d.tokenRotatedAt }).from(d).where(eq(d.id, deviceId));
  if (row?.tokenRotatedAt && Date.now() - new Date(row.tokenRotatedAt).getTime() < ROTATE_MS) return null;
  const token = newDeviceToken();
  await getDb().update(d).set({ prevTokenHash: sql`${d.tokenHash}`, tokenHash: await sha256(token), tokenRotatedAt: sql`now()` }).where(eq(d.id, deviceId));
  return token;
}

export async function setDeviceCookie(token: string) {
  (await (await import("next/headers")).cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
}
