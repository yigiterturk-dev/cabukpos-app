"use server";

import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { isGrowthSegment } from "@/lib/growth/segments";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Sadece taslak oluşturur; hiçbir iletişim sağlayıcısına gönderim yapmaz. */
export async function createCampaignDraft(form: FormData) {
  const a = await requireWriter();
  const name = text(form, "name").slice(0, 80);
  const message = text(form, "message").slice(0, 500);
  const segment = text(form, "segment");
  if (name.length < 2 || message.length < 5 || !isGrowthSegment(segment)) redirect("/yonetim/buyume?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    const audienceWhere = segment === "dormant_30"
      ? and(eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, sql`now() - interval '30 days'`))
      : segment === "active_30"
        ? and(eq(schema.customers.marketingConsent, true), gte(schema.customers.lastOrderAt, sql`now() - interval '30 days'`))
        : eq(schema.customers.marketingConsent, true);
    const [audience] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers)
      .where(audienceWhere);
    const [campaign] = await tx.insert(schema.growthCampaigns).values({ tenantId: a.tenantId, name, segment, message, channel: "manual", audienceCount: audience?.n ?? 0, createdBy: a.id }).returning({ id: schema.growthCampaigns.id });
    await audit(tx, a.tenantId, `user:${a.id}`, "growth.campaign.draft", { id: campaign.id, segment, audienceCount: audience?.n ?? 0 });
  });
  revalidatePath("/yonetim/buyume");
  redirect("/yonetim/buyume?olusturuldu=1");
}
