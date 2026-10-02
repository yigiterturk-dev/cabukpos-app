// lib/growth/messaging/send.ts — Onaylı kampanyayı gerçek sağlayıcıya sayfa sayfa gönderir (sunucu; PII dışarı çıkmaz).
// Telefon yalnız sağlayıcı HTTP çağrısında kullanılır; log/audit'e asla yazılmaz. Opt-out: sağlayıcı geri çağrısı
// /api/growth/campaigns/[id]/events üzerinden opt_out olayı yazar, izin anında kapanır; sonraki sayfalar izinli kalmayı alır.
import { and, eq, gt, gte, isNotNull, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { decodeAudienceCursor, encodeAudienceCursor, recipientRef } from "@/lib/growth/recipient-ref";
import { isGrowthSegment, type GrowthSegment } from "@/lib/growth/segments";
import { recordCampaignEvent } from "@/lib/growth/events";
import { sandboxSmsProvider } from "./sandbox";
import type { MessagingProvider, MessagingSendResult } from "./types";

const PAGE = 100;
const MAX_PAGES = 5; // tek istekte en fazla 500 gönderim; kalanı tekrar "Gönder" ile sürer

export function growthRefSecret(tenantId: string) {
  return process.env.GROWTH_REF_SECRET?.trim() || `growth:${tenantId}`;
}

export type SendPageResult =
  | { error: "provider_disabled" | "campaign_not_found" | "not_approved" | "provider_error" }
  | { sent: number; failed: number; remaining: number };

function audienceWhere(tenantId: string, segment: GrowthSegment) {
  const dormantSince = sql`now() - interval '30 days'`;
  return segment === "dormant_30"
    ? and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, dormantSince))
    : segment === "active_30"
      ? and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.marketingConsent, true), gte(schema.customers.lastOrderAt, dormantSince))
      : and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.marketingConsent, true));
}

/** Bir turda en fazla MAX_PAGES×PAGE izinli alıcıya gönderir; daha önce sent olayı yazılmışları atlar. */
export async function sendGrowthCampaignPage(input: { tenantId: string; campaignId: string; actor: string; provider?: MessagingProvider | null }): Promise<SendPageResult> {
  const provider = input.provider === undefined ? sandboxSmsProvider : input.provider;
  if (!provider) return { error: "provider_disabled" };
  const secret = growthRefSecret(input.tenantId);
  const head = await withTenant(input.tenantId, async (tx) => {
    const [campaign] = await tx.select({ id: schema.growthCampaigns.id, segment: schema.growthCampaigns.segment, message: schema.growthCampaigns.message, audienceCount: schema.growthCampaigns.audienceCount, approvedAt: schema.growthCampaigns.approvedAt })
      .from(schema.growthCampaigns).where(and(eq(schema.growthCampaigns.id, input.campaignId), eq(schema.growthCampaigns.tenantId, input.tenantId))).limit(1);
    if (!campaign) return null;
    const segment = isGrowthSegment(campaign.segment) ? campaign.segment : null;
    if (!segment) return null;
    const sentRefs = new Set(
      (await tx.select({ ref: schema.growthCampaignEvents.recipientRef }).from(schema.growthCampaignEvents)
        .where(and(eq(schema.growthCampaignEvents.campaignId, campaign.id), eq(schema.growthCampaignEvents.tenantId, input.tenantId), eq(schema.growthCampaignEvents.type, "sent"), isNotNull(schema.growthCampaignEvents.recipientRef))))
        .map((r) => r.ref!),
    );
    return { campaign: { ...campaign, segment }, sentRefs };
  });
  if (!head) return { error: "campaign_not_found" };
  const { campaign, sentRefs } = head;
  if (!campaign.approvedAt) return { error: "not_approved" };

  const where = audienceWhere(input.tenantId, campaign.segment);
  let sent = 0, failed = 0;
  let cursor: string | null = null;
  const fetchPage = (startId: string | null): Promise<{ id: string; phone: string }[]> =>
    withTenant(input.tenantId, (tx) =>
      tx.select({ id: schema.customers.id, phone: schema.customers.phone }).from(schema.customers)
        .where(startId ? and(where, gt(schema.customers.id, startId)) : where).orderBy(schema.customers.id).limit(PAGE + 1));

  for (let page = 0; page < MAX_PAGES; page++) {
    const startId = cursor ? decodeAudienceCursor(cursor) : null;
    if (cursor && !startId) break;
    const rows = await fetchPage(startId);
    const hasNext = rows.length > PAGE;
    const fresh = rows.slice(0, PAGE).filter((r) => r.phone && !sentRefs.has(recipientRef(secret, r.phone)));
    cursor = hasNext ? encodeAudienceCursor(rows[PAGE - 1].id) : null;
    if (!fresh.length) { if (!cursor) break; continue; }

    let results: MessagingSendResult[];
    try {
      results = await provider.send({ body: campaign.message, targets: fresh.map((r) => ({ recipientRef: recipientRef(secret, r.phone), phone: r.phone })) });
    } catch {
      return { sent, failed, remaining: Math.max(0, campaign.audienceCount - sentRefs.size - sent) };
    }
    const okCount = results.filter((r) => r.externalId).length;
    await withTenant(input.tenantId, async (tx) => {
      for (const [i, r] of results.entries()) {
        const target = fresh[i];
        await tx.insert(schema.growthRecipientRefs).values({ tenantId: input.tenantId, recipientRef: r.recipientRef, customerId: target.id })
          .onConflictDoUpdate({ target: [schema.growthRecipientRefs.tenantId, schema.growthRecipientRefs.recipientRef], set: { customerId: target.id } });
        if (r.externalId) await recordCampaignEvent(tx, { tenantId: input.tenantId, campaignId: campaign.id, type: "sent", externalId: r.externalId, recipientRef: r.recipientRef, actor: input.actor });
      }
      // audit'te telefon/ref yok; yalnız sayfa sayısı
      await audit(tx, input.tenantId, input.actor, "growth.campaign.send", { campaignId: campaign.id, page: page + 1, sent: okCount, failed: results.length - okCount });
    });
    sent += okCount;
    failed += results.length - okCount;
    for (const r of results) sentRefs.add(r.recipientRef);
    if (!cursor) break;
  }
  return { sent, failed, remaining: Math.max(0, campaign.audienceCount - sentRefs.size) };
}
