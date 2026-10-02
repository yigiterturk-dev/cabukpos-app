"use server";
// M9c ajans erişim anahtarları: yalnız işletme sahibi. Oluşturma abonelik kilidinde kapalı; iptal her zaman açık (güvenlik).
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireAdmin, requireWriter } from "@/lib/auth/session";
import { checkReauth } from "@/lib/auth/reauth";
import { createKey, revokeKey, type IntegrationScope } from "@/lib/integrations/keys";
import { audit } from "@/lib/audit";

export type KeyState = { error?: string; field?: string; key?: string; name?: string };
const PATH = "/yonetim/entegrasyonlar";

export async function createIntegrationKey(_: KeyState, form: FormData): Promise<KeyState> {
  const a = await requireWriter();
  if (a.role !== "sahip") return { error: "Anahtarı yalnız işletme sahibi oluşturabilir." };
  // Hassas işlem (#8): kimlik bilgisi üretimi hesap şifresiyle teyitli.
  const re = await checkReauth(a.id, form);
  if (re) return { error: re, field: "sifre" };
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { error: "Ad 2-40 karakter.", field: "name" };
  const scope: IntegrationScope = form.get("scope") === "growth" ? "growth" : "stats";
  const { id, key } = await createKey(a.tenantId, name, scope);
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "integration_key.create", { id, name, scope }));
  revalidatePath(PATH);
  return { key, name };
}

export async function revokeIntegrationKey(id: string): Promise<void> {
  const a = await requireAdmin();
  if (a.role !== "sahip") return;
  if (await revokeKey(a.tenantId, id)) await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "integration_key.revoke", { id }));
  revalidatePath(PATH);
}
