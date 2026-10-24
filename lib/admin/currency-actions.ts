"use server";
// #16: işletme para birimi ayarı (sahip + müdür). Kuruş değerleri dönüştürülmez — yalnız gösterim değişir.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { canManageStores } from "@/lib/core/access";
import { audit } from "@/lib/audit";
import { isCurrency } from "@/lib/core/money";

export async function setTenantCurrency(_s: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Para birimi yalnız sahip ve zincir merkezinde değiştirilebilir." };
  const currency = String(form.get("currency") ?? "");
  if (!isCurrency(currency)) return { error: "Para birimi seçin." };
  await getDb().update(schema.tenants).set({ currency }).where(eq(schema.tenants.id, a.tenantId));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "tenant.currency", { currency }));
  revalidatePath("/yonetim/tercihler");
  revalidatePath("/yonetim");
  return { ok: true };
}
