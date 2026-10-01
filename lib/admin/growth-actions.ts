"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { createGrowthCampaignDraft, isGrowthSegment } from "@/lib/growth/campaigns";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Sadece taslak oluşturur; hiçbir iletişim sağlayıcısına gönderim yapmaz. */
export async function createCampaignDraft(form: FormData) {
  const a = await requireWriter();
  const name = text(form, "name").slice(0, 80);
  const message = text(form, "message").slice(0, 500);
  const segment = text(form, "segment");
  if (name.length < 2 || message.length < 5 || !isGrowthSegment(segment)) redirect("/yonetim/buyume?hata=eksik");
  await withTenant(a.tenantId, (tx) => createGrowthCampaignDraft(tx, { tenantId: a.tenantId, name, message, segment, actor: `user:${a.id}`, createdBy: a.id }));
  revalidatePath("/yonetim/buyume");
  redirect("/yonetim/buyume?olusturuldu=1");
}
