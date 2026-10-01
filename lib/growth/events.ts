import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";

export type GrowthEventType = "sent" | "delivered" | "converted" | "opt_out" | "failed";
export type GrowthEventInput = { tenantId: string; campaignId: string; type: GrowthEventType; externalId: string; recipientRef?: string; amount?: number; customerId?: string; actor: string };
export type GrowthEventResult = { error: "campaign_not_found" | "customer_not_found" } | { duplicate: true } | { id: string; duplicate: false };

/** Tenant transactionı içinde ölçüm olayını idempotent olarak kaydeder; iletişim göndermez. */
export async function recordCampaignEvent(tx: Tx, input: GrowthEventInput): Promise<GrowthEventResult> {
  const [campaign] = await tx.select({ id: schema.growthCampaigns.id }).from(schema.growthCampaigns)
    .where(and(eq(schema.growthCampaigns.id, input.campaignId), eq(schema.growthCampaigns.tenantId, input.tenantId))).limit(1);
  if (!campaign) return { error: "campaign_not_found" };
  let customerId = input.customerId;
  if (input.type === "opt_out" && !customerId && input.recipientRef) {
    const [ref] = await tx.select({ customerId: schema.growthRecipientRefs.customerId }).from(schema.growthRecipientRefs)
      .where(and(eq(schema.growthRecipientRefs.tenantId, input.tenantId), eq(schema.growthRecipientRefs.recipientRef, input.recipientRef))).limit(1);
    customerId = ref?.customerId;
  }
  if (input.type === "opt_out") {
    if (!customerId) return { error: "customer_not_found" };
    const [customer] = await tx.select({ id: schema.customers.id }).from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, input.tenantId))).limit(1);
    if (!customer) return { error: "customer_not_found" };
  }
  const amount = input.type === "converted" ? Math.max(0, input.amount ?? 0) : 0;
  const [inserted] = await tx.insert(schema.growthCampaignEvents).values({
    tenantId: input.tenantId, campaignId: input.campaignId, customerId: customerId ?? null, type: input.type, externalId: input.externalId, recipientRef: input.recipientRef ?? null, amount,
  }).onConflictDoNothing({ target: [schema.growthCampaignEvents.campaignId, schema.growthCampaignEvents.externalId] }).returning({ id: schema.growthCampaignEvents.id });
  if (!inserted) return { duplicate: true };
  if (input.type === "opt_out") {
    await tx.update(schema.customers).set({ marketingConsent: false, marketingConsentAt: null, marketingConsentSource: "provider_opt_out" })
      .where(and(eq(schema.customers.id, customerId!), eq(schema.customers.tenantId, input.tenantId)));
  }
  await audit(tx, input.tenantId, input.actor, "growth.campaign.event", { campaignId: input.campaignId, type: input.type, amount, optOutApplied: input.type === "opt_out" });
  return { id: inserted.id, duplicate: false };
}
