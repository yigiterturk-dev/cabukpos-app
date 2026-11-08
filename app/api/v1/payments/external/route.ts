// Dış ödeme özeti (YanındaPOS → ÇabukPOS): POST /api/v1/payments/external
// Authorization: Bearer cpk_… (scope=payments). Idempotent: (source, externalId).
// Satış/fiş/mali belge üretmez; yalnız raporlama/mutabakat referansıdır.
import { z } from "zod";
import { keyFromRequest } from "@/lib/integrations/keys";
import { recordExternalPayment } from "@/lib/integrations/payments";
import { hit } from "@/lib/ratelimit";
import { isCurrency } from "@/lib/core/money";

export const dynamic = "force-dynamic";

const MAX_BODY = 16_384;
const MAX_META = 4_096;

const body = z.object({
  source: z.string().trim().min(1).max(40).default("yanindapos"),
  externalId: z.string().trim().min(1).max(200),
  amount: z.number().int().positive().max(2_147_483_647),
  currency: z.string().trim().length(3).default("TRY"),
  method: z.enum(["nakit", "kart", "havale", "other"]).default("other"),
  paidAt: z.string().trim().refine((s) => !Number.isNaN(Date.parse(s)), "paidAt geçerli bir ISO tarih olmalı"),
  reference: z.string().trim().max(200).optional(),
  storeId: z.string().uuid().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
}).strict();

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const key = await keyFromRequest(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  if (key.scope !== "payments") return Response.json({ error: "forbidden_scope" }, { status: 403, headers: noStore });
  if ((await hit(`apikey:payments:${key.id}`, 1)) > 60) return Response.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
  let json: unknown;
  try { json = JSON.parse(text); } catch { return Response.json({ error: "invalid_json" }, { status: 400, headers: noStore }); }
  const parsed = body.safeParse(json);
  if (!parsed.success) {
    return Response.json({
      error: "invalid_body",
      issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    }, { status: 400, headers: noStore });
  }
  const b = parsed.data;
  if (b.meta && JSON.stringify(b.meta).length > MAX_META) return Response.json({ error: "meta_too_large" }, { status: 400, headers: noStore });
  const currency = b.currency.toUpperCase();
  if (!isCurrency(currency)) return Response.json({ error: "unsupported_currency" }, { status: 400, headers: noStore });
  const result = await recordExternalPayment({
    tenantId: key.tenantId,
    storeId: b.storeId ?? null,
    source: b.source,
    externalId: b.externalId,
    amount: b.amount,
    currency,
    method: b.method,
    paidAt: new Date(b.paidAt),
    reference: b.reference ?? null,
    meta: b.meta,
    actor: `integration:${key.id}`,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400, headers: noStore });
  return Response.json({ ok: true, id: result.id, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201, headers: noStore });
}
