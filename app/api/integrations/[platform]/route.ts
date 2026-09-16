/**
 * Online sipariş webhook'u — platform → ÇabukPOS.
 *
 * GÜVENLİK:
 *  1) Secret: `x-api-key` başlığı, integration_credentials.secret ile birebir karşılaştırılır.
 *     Eşleşen + enabled k credential YOKSA 404 — yüzey oluşturmaz.
 *  2) Idempotensi: (platform, external_id) UNIQUE — platform retry'ı çift adisyon yaratamaz.
 *  3) HAM gövde jsonb olarak saklanır: eşleme bozulsa bile sipariş denetimde durur.
 *
 * Kurulum: partner paneline bu URL + x-api-key verilir
 *   POST /api/integrations/tgo         (Trendyol Go / Uber Eats)
 *   POST /api/integrations/yemeksepeti (Yemeksepeti)
 */

import { NextResponse } from "next/server";

import { isPlatform, type PlatformId } from "@/lib/integrations/types";
import { parseOrder } from "@/lib/integrations/parse";
import {
  findEnabledCredential,
  ingestOrder,
  markOrderStatus,
  saveRawOrder,
} from "@/lib/integrations/ingest";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ platform: string }> }
): Promise<Response> {
  const { platform } = await ctx.params;
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "unknown_platform" }, { status: 404 });
  }
  const p: PlatformId = platform;

  // IP bazlı rate limit — kötü niyetli doldurmayı önler
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "bilinmiyor";
  if (await rateLimited(`integration:${p}:${ip}`, { windowMs: 60_000, max: 120 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const secret = req.headers.get("x-api-key") ?? "";
  if (!secret) {
    return NextResponse.json({ error: "missing_key" }, { status: 401 });
  }

  let businessId: string | null = null;
  try {
    businessId = await findEnabledCredential(p, secret);
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  if (!businessId) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 1) Ham kayıt (idempotent) — parse başarısız olsa bile sipariş burada durur.
  let rowId: string | null = null;
  try {
    const parsed = parseOrder(p, payload);
    rowId = await saveRawOrder({
      platform: p,
      externalId: parsed.externalId,
      businessId,
      payload,
    });

    if (!rowId) {
      // Aynı externalId daha önce işlendi — retry. Sessizce onayla.
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // 2) Adisyona yaz
    const result = await ingestOrder(businessId, parsed);
    await markOrderStatus(rowId, businessId, "mapped");
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "bilinmeyen hata";
    if (rowId) await markOrderStatus(rowId, businessId, "failed", message);
    console.warn(`[integration:${p}] ingest hatası:`, message);
    // Platforma 200 dönmezsek retry fırtınası olur; hata kayıtlı, yüzeye 202 dönelim.
    return NextResponse.json({ ok: false, error: message }, { status: 202 });
  }
}
