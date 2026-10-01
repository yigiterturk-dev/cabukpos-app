import { z } from "zod";
import { baselineAdvisor, type GrowthInsight } from "@/lib/growth/advisor";
import type { GrowthFeaturePack } from "@/lib/growth/advisor";

const Insight = z.object({
  key: z.string().min(1).max(80),
  kind: z.enum(["opportunity", "observation", "warning"]),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1000),
  confidence: z.enum(["observed", "insufficient_data"]),
  evidence: z.record(z.string(), z.number().finite().min(0).max(1_000_000_000)).default({}),
});
const Remote = z.object({ insights: z.array(Insight).max(20) });

export type GrowthAdvice = { provider: "baseline" | "laya"; insights: GrowthInsight[]; fallback?: "not_configured" | "remote_error" };

/** Laya HTTP adapter: PII'siz pack gönderir, cevabı doğrular, hata olursa güvenli fallback döner. */
export async function advise(pack: GrowthFeaturePack): Promise<GrowthAdvice> {
  const url = process.env.GROWTH_ADVISOR_URL?.trim();
  const token = process.env.GROWTH_ADVISOR_TOKEN?.trim();
  if (!url || !token) return { provider: "baseline", fallback: "not_configured", insights: baselineAdvisor(pack) };
  try {
    const parsedUrl = new URL(url);
    if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") throw new Error("Laya URL production'da HTTPS olmalı.");
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
    return { provider: "laya", insights: body.insights };
  } catch {
    return { provider: "baseline", fallback: "remote_error", insights: baselineAdvisor(pack) };
  }
}
