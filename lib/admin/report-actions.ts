"use server";
// #41: rapor e-postası ayarları (sahip/müdür).
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { sendReportMail } from "@/lib/admin/report-mail";

export type ReportMailState = { error?: string; info?: string; savedAt?: number };

export async function saveReportMail(_: ReportMailState, form: FormData): Promise<ReportMailState> {
  const a = await requireWriter();
  const daily = form.get("daily") === "on";
  const weekly = form.get("weekly") === "on";
  await withTenant(a.tenantId, async (tx) => {
    const v = { daily, weekly };
    await tx.insert(schema.reportSettings).values({ tenantId: a.tenantId, ...v }).onConflictDoUpdate({ target: schema.reportSettings.tenantId, set: v });
    await audit(tx, a.tenantId, `user:${a.id}`, "report.mail", v);
  });
  revalidatePath("/yonetim/raporlar");
  return { savedAt: Date.now() };
}

/** Ayar ne olursa olsun dünün özetini dener (test gönderimi). */
export async function sendTestReport(): Promise<ReportMailState> {
  const a = await requireWriter();
  const r = await sendReportMail(a.tenantId, "gunluk", { force: true });
  revalidatePath("/yonetim/raporlar");
  if (r.ok) return { info: `Dünün özeti ${r.recipients} alıcıya gönderildi.` };
  const why = r.skipped === "mail" ? "Posta yapılandırılmamış (RESEND_API_KEY/MAIL_FROM)."
    : r.skipped === "alici" ? "Doğrulanmış alıcı yok — sahip/müdür e-postası doğrulanmalı."
    : "Ayar satırı yok — önce Kaydet'e basın.";
  return { error: `Gönderilemedi: ${why}` };
}
