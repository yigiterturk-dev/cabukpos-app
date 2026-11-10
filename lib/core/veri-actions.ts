// lib/core/veri-actions.ts — hesap silme server action'ı.
// Koruma katmanları: CSRF (assertCsrf), sahip rolü, şifre ile yeniden doğrulama,
// işletme adının harfi harfine yazılması. Hepsi geçmeden silme çalışmaz.

"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb, schema } from "@/db";
import { clearAdminSession, getAdmin } from "@/lib/auth/session";
import { assertCsrf } from "@/lib/auth/csrf";
import { checkReauth } from "@/lib/auth/reauth";
import { dispatchAlert } from "@/lib/observability/alerts";
import { hesabiSil } from "./veri";
import { isimEslesiyor } from "./veri-confirm";

export type VeriSilState = { error?: string; ok?: string; field?: string };

export async function hesapSilAction(_: VeriSilState, form: FormData): Promise<VeriSilState> {
  await assertCsrf();
  const a = await getAdmin();
  if (!a) return { error: "Oturum bulunamadı. Yeniden giriş yapın." };
  if (a.role !== "sahip") return { error: "Hesabı yalnız işletme sahibi silebilir." };

  const re = await checkReauth(a.id, form);
  if (re) return { error: re, field: "sifre" };

  const [t] = await getDb().select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId));
  if (!t) return { error: "İşletme bulunamadı." };
  if (!isimEslesiyor(String(form.get("onay") ?? ""), t.name)) {
    return { error: "İşletme adı eşleşmedi. Silme yapılmadı.", field: "onay" };
  }

  await hesabiSil(a.tenantId);
  // Denetim izi veritabanında kalamaz (kiracı silindi); operasyon hattına bırakılır.
  await dispatchAlert("tenant.deleted", { tenantId: a.tenantId, actor: a.id });
  await clearAdminSession();
  redirect("/?hesap=silindi");
}
