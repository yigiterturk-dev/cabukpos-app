"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { createGrowthCampaignDraft, isGrowthSegment } from "@/lib/growth/campaigns";
import { approveGrowthCampaign } from "@/lib/growth/campaign-approval";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Sadece taslak oluşturur; hiçbir iletişim sağlayıcısına gönderim yapmaz. */
export async function createCampaignDraft(form: FormData) {
  const a = await requireWriter();
  if (a.vertical !== "restoran") redirect("/yonetim");
  const name = text(form, "name").slice(0, 80);
  const message = text(form, "message").slice(0, 500);
  const segment = text(form, "segment");
  if (name.length < 2 || message.length < 5 || !isGrowthSegment(segment)) redirect("/yonetim/buyume?hata=eksik");
  await withTenant(a.tenantId, (tx) => createGrowthCampaignDraft(tx, { tenantId: a.tenantId, name, message, segment, actor: `user:${a.id}`, createdBy: a.id }));
  revalidatePath("/yonetim/buyume");
  redirect("/yonetim/buyume?olusturuldu=1");
}

export async function approveCampaign(form: FormData) {
  const a = await requireWriter();
  const campaignId = text(form, "campaignId");
  if (a.role !== "sahip" || a.vertical !== "restoran" || !campaignId) redirect("/yonetim/buyume");
  await withTenant(a.tenantId, (tx) => approveGrowthCampaign(tx, { tenantId: a.tenantId, campaignId, approvedBy: a.id, actor: "user:" + a.id }));
  revalidatePath("/yonetim/buyume/" + campaignId);
  redirect("/yonetim/buyume/" + campaignId + "?onaylandi=1");
}
