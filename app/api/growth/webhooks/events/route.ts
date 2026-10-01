import { z } from "zod";
import { withTenant } from "@/db";
import { recordCampaignEvent } from "@/lib/growth/events";
import { growthWebhookAccess } from "@/lib/growth/access";
import { verifyGrowthWebhookSignature } from "@/lib/growth/webhook";
import { growthEventInput } from "@/lib/growth/event-input";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Sağlayıcı webhook'u: imzalı, timestamp'li ve yalnızca ölçüm olayı kabul eder. */
export async function POST(req: Request) {
  const access = await growthWebhookAccess(req);
  if (access instanceof Response) return access;
  const rawBody = await req.text();
  if (rawBody.length > 64_000) return Response.json({ error: "payload_too_large" }, { status: 413 });
  if (!verifyGrowthWebhookSignature({
    rawBody,
    timestamp: req.headers.get("x-cabukpos-timestamp"),
    signature: req.headers.get("x-cabukpos-signature"),
    secret: access.credential,
  })) return Response.json({ error: "invalid_signature" }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_event" }, { status: 400 });
  }
  const parsed = z.object({ campaignId: z.string().uuid() }).and(growthEventInput).safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_event" }, { status: 400 });
  const { campaignId, ...event } = parsed.data;
  const result = await withTenant(access.tenantId, (tx) => recordCampaignEvent(tx, { tenantId: access.tenantId, campaignId, ...event, actor: access.actor }));
  if ("error" in result) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
