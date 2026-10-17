"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { createGrowthCampaignDraft, isGrowthSegment } from "@/lib/growth/campaigns";
import { approveGrowthCampaign } from "@/lib/growth/campaign-approval";
import { messagingProvider, sendGrowthCampaignPage } from "@/lib/growth/messaging";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export type CampaignDraftState = { error?: string; field?: string };
/** Sadece taslak oluşturur; hiçbir iletişim sağlayıcısına gönderim yapmaz. */
export async function createCampaignDraft(_: CampaignDraftState, form: FormData): Promise<CampaignDraftState> {
  const a = await requireWriter();
  if (a.vertical !== "restoran") redirect("/yonetim");
  const name = text(form, "name").slice(0, 80);
  const message = text(form, "message").slice(0, 500);
  const segment = text(form, "segment");
  if (name.length < 2) return { error: "Kampanya adı en az 2 karakter olmalı.", field: "name" };
  if (message.length < 5) return { error: "Mesaj taslağı en az 5 karakter olmalı.", field: "message" };
  if (!isGrowthSegment(segment)) return { error: "Müşteri segmenti geçersiz; sayfayı yenileyip yeniden deneyin.", field: "segment" };
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

/** Onaylı kampanyanın izinli alıcılarını sağlayıcıya gönderir (sayfa başına 100, turda en fazla 500). */
export async function sendCampaignPageAction(form: FormData) {
  const a = await requireWriter();
  const campaignId = text(form, "campaignId");
  if (a.role !== "sahip" || a.vertical !== "restoran" || !campaignId) redirect("/yonetim/buyume");
  const provider = messagingProvider();
  if (!provider) redirect("/yonetim/buyume/" + campaignId + "?hata=saglayici");
  const result = await sendGrowthCampaignPage({ tenantId: a.tenantId, campaignId, actor: "user:" + a.id, provider });
  if ("error" in result) redirect("/yonetim/buyume/" + campaignId + "?hata=" + result.error);
  const query = new URLSearchParams({ gonderildi: String(result.sent), kalan: String(result.remaining) });
  if (result.failed) query.set("basarisiz", String(result.failed));
  revalidatePath("/yonetim/buyume/" + campaignId);
  redirect("/yonetim/buyume/" + campaignId + "?" + query.toString());
}
