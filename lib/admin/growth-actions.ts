"use server";

import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Sadece taslak oluşturur; hiçbir iletişim sağlayıcısına gönderim yapmaz. */
export async function createCampaignDraft(form: FormData) {
  const a = await requireWriter();
  const name = text(form, "name").slice(0, 80);
  const message = text(form, "message").slice(0, 500);
  if (name.length < 2 || message.length < 5) redirect("/yonetim/buyume?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    const [audience] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers)
      .where(and(eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, sql`now() - interval '30 days'`)));
    const [campaign] = await tx.insert(schema.growthCampaigns).values({ tenantId: a.tenantId, name, segment: "dormant_30", message, channel: "manual", audienceCount: audience?.n ?? 0, createdBy: a.id }).returning({ id: schema.growthCampaigns.id });
    await audit(tx, a.tenantId, `user:${a.id}`, "growth.campaign.draft", { id: campaign.id, segment: "dormant_30", audienceCount: audience?.n ?? 0 });
  });
  revalidatePath("/yonetim/buyume");
  redirect("/yonetim/buyume?olusturuldu=1");
}
