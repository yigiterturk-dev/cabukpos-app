"use server";
// Kasa eylemi: cihaz eşleme. PIN, vardiya ve satış M2'den beri cihazda + /api/sync.
import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema, withTenant } from "@/db";
import { setDeviceCookie } from "@/lib/auth/kasa";
import { newDeviceToken, sha256 } from "@/lib/auth/tokens";
import { clientIp, hit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export type KasaState = { error?: string; field?: string };

export async function pairDevice(_: KasaState, form: FormData): Promise<KasaState> {
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/\s/g, "");
  if ((await hit(`pair:${await clientIp()}`)) > 10) return { error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin.", field: "code" };
  if (!/^[A-Z2-9]{8}$/.test(code)) return { error: "Kod geçersiz ya da süresi dolmuş.", field: "code" };
  const token = newDeviceToken();
  const d = schema.devices;
  const [row] = await getDb()
    .update(d)
    .set({ tokenHash: await sha256(token), pairingCode: null, pairingExpiresAt: null, pairedAt: sql`now()`, lastSeenAt: sql`now()` })
    .where(and(eq(d.pairingCode, code), sql`${d.pairingExpiresAt} > now()`, isNull(d.revokedAt)))
    .returning({ id: d.id, tenantId: d.tenantId });
  if (!row) return { error: "Kod geçersiz ya da süresi dolmuş.", field: "code" };
  await withTenant(row.tenantId, (tx) => audit(tx, row.tenantId, `device:${row.id}`, "device.paired"));
  await setDeviceCookie(token);
  redirect("/kasa");
}
