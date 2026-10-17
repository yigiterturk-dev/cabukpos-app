"use server";
// Kasa cihazları: ekle (eşleme kodu), yeni kod (eski cihaz düşer), iptal. devices RLS dışı → her sorguda tenantId koşulu.
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { checkReauth } from "@/lib/auth/reauth";
import { newPairingCode } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";
import { scopedStoreId } from "@/lib/admin/store-scope";

export type DeviceState = { error?: string; field?: string; code?: string; expiresAt?: string; deviceName?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const PAIR_MINUTES = 15;

async function assignCode(tenantId: string, deviceId: string): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + PAIR_MINUTES * 60_000);
  for (let i = 0; i < 5; i++) {
    const code = newPairingCode();
    try {
      await getDb().update(schema.devices).set({ pairingCode: code, pairingExpiresAt: expiresAt, tokenHash: null, pairedAt: null, revokedAt: null }).where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, tenantId)));
      return { code, expiresAt };
    } catch (e) {
      if (!String((e as Error & { cause?: Error }).cause?.message ?? e).includes("unique")) throw e;
    }
  }
  throw new Error("Eşleme kodu üretilemedi.");
}

export async function createDevice(_: DeviceState, form: FormData): Promise<DeviceState> {
  const a = await requireWriter();
  const name = String(form.get("name") ?? "").trim();
  const prefix = String(form.get("receiptPrefix") ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > 40) return { error: "Cihaz adı 2-40 karakter.", field: "name" };
  if (!/^[A-Z0-9]{1,4}$/.test(prefix)) return { error: "Fiş öneki 1-4 harf/rakam (ör. K1).", field: "receiptPrefix" };
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  if (!storeId) return { error: "Önce bir şube oluşturun." };
  const [dup] = await getDb().select({ id: schema.devices.id }).from(schema.devices).where(and(eq(schema.devices.tenantId, a.tenantId), eq(schema.devices.receiptPrefix, prefix)));
  if (dup) return { error: "Bu fiş öneki başka bir cihazda.", field: "receiptPrefix" };
  const [d] = await getDb().insert(schema.devices).values({ tenantId: a.tenantId, storeId, name, receiptPrefix: prefix }).returning({ id: schema.devices.id });
  const c = await assignCode(a.tenantId, d.id);
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "device.create", { id: d.id, name, prefix }));
  revalidatePath("/yonetim/cihazlar");
  return { code: c.code, expiresAt: c.expiresAt.toISOString(), deviceName: name };
}

export async function newPairing(deviceId: string): Promise<DeviceState> {
  const a = await requireWriter();
  if (!UUID.test(deviceId)) return { error: "Cihaz bulunamadı." };
  const [d] = await getDb().select({ name: schema.devices.name }).from(schema.devices).where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, a.tenantId)));
  if (!d) return { error: "Cihaz bulunamadı." };
  const c = await assignCode(a.tenantId, deviceId);
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "device.pair_code", { id: deviceId }));
  revalidatePath("/yonetim/cihazlar");
  return { code: c.code, expiresAt: c.expiresAt.toISOString(), deviceName: d.name };
}

export async function revokeDevice(deviceId: string, state: { error?: string } = {}, form?: FormData): Promise<{ error?: string }> {
  const a = await requireWriter();
  if (!UUID.test(deviceId)) return {};
  if (form && (await checkReauth(a.id, form))) { void state; return { error: "Şifre hatalı ya da boş; cihaz iptal edilmedi." }; }
  await getDb().update(schema.devices).set({ revokedAt: sql`now()`, tokenHash: null, prevTokenHash: null, pairingCode: null }).where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, a.tenantId)));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "device.revoke", { id: deviceId }));
  revalidatePath("/yonetim/cihazlar");
  return {};
}
