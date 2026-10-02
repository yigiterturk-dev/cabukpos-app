import { z } from "zod";
import { baselineAdvisor, type GrowthInsight } from "@/lib/growth/advisor";
import type { GrowthFeaturePack } from "@/lib/growth/advisor";

const EVIDENCE_KEYS = new Set([
  "total", "consented", "active30", "dormant30", "consentedDormant30", "new30",
  "orders90", "gross90", "avgBasket90", "sent", "delivered", "converted", "revenue",
]);
const Evidence = z.record(z.string(), z.number().finite().min(0).max(1_000_000_000)).superRefine((value, ctx) => {
  for (const key of Object.keys(value)) {
    if (!EVIDENCE_KEYS.has(key)) ctx.addIssue({ code: "custom", path: [key], message: "bilinmeyen evidence metriği" });
  }
});
const Insight = z.object({
  key: z.string().min(1).max(80),
  kind: z.enum(["opportunity", "observation", "warning"]),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1000),
  confidence: z.enum(["observed", "insufficient_data"]),
  evidence: Evidence.default({}),
});
const Remote = z.object({ insights: z.array(Insight).max(20) });
const PLACEHOLDER_HOSTS = new Set(["localhost", "example.com", "example.org", "example.net"]);

function validateAdvisorUrl(raw: string): URL {
  const parsed = new URL(raw);
  if (parsed.username || parsed.password) throw new Error("Laya URL userinfo içeremez.");
  if (process.env.NODE_ENV === "production") {
    if (parsed.protocol !== "https:") throw new Error("Laya URL production'da HTTPS olmalı.");
    if (PLACEHOLDER_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".localhost") || parsed.hostname.endsWith(".example.com") || parsed.hostname.endsWith(".example.org") || parsed.hostname.endsWith(".example.net")) {
      throw new Error("Laya URL production'da gerçek bir host olmalı.");
    }
  }
  return parsed;
}

function observedEvidence(pack: GrowthFeaturePack): Record<string, number> {
  return {
    total: pack.customer.total,
    consented: pack.customer.consented,
    active30: pack.customer.active30,
    dormant30: pack.customer.dormant30,
    consentedDormant30: pack.customer.consentedDormant30,
    new30: pack.customer.new30,
    orders90: pack.package90.orders,
    gross90: pack.package90.gross,
    avgBasket90: pack.package90.avgBasket,
    sent: pack.campaigns.events.sent,
    delivered: pack.campaigns.events.delivered,
    converted: pack.campaigns.events.converted,
    revenue: pack.campaigns.events.revenue,
  };
}

function assertObservedEvidence(insights: z.infer<typeof Remote>["insights"], pack: GrowthFeaturePack) {
  const observed = observedEvidence(pack);
  for (const insight of insights) {
    for (const [key, value] of Object.entries(insight.evidence)) {
      if (observed[key] !== value) throw new Error(`Laya evidence POS verisiyle eşleşmiyor: ${key}`);
    }
  }
}

export type GrowthAdvice = { provider: "baseline" | "laya"; insights: GrowthInsight[]; fallback?: "not_configured" | "remote_error" };

/** Laya HTTP adapter: PII'siz pack gönderir, cevabı doğrular, hata olursa güvenli fallback döner. */
export async function advise(pack: GrowthFeaturePack): Promise<GrowthAdvice> {
  const url = process.env.GROWTH_ADVISOR_URL?.trim();
  const token = process.env.GROWTH_ADVISOR_TOKEN?.trim();
  if (!url || !token) return { provider: "baseline", fallback: "not_configured", insights: baselineAdvisor(pack) };
  try {
    const parsedUrl = validateAdvisorUrl(url);
    const response = await fetch(parsedUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-cabukpos-schema-version": "1" },
      body: JSON.stringify(pack),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Laya HTTP ${response.status}`);
    const raw = await response.text();
    if (raw.length > 64_000) throw new Error("Laya cevabı boyut sınırını aştı.");
    const body = Remote.parse(JSON.parse(raw));
    assertObservedEvidence(body.insights, pack);
    return { provider: "laya", insights: body.insights };
  } catch {
    return { provider: "baseline", fallback: "remote_error", insights: baselineAdvisor(pack) };
  }
}
