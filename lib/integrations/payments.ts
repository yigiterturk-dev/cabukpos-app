// lib/integrations/payments.ts — Dış sistemden gelen tamamlanmış ödeme özeti (tek yönlü referans).
// Satış/fiş/mali belge üretmez; yalnız raporlama ve mutabakat içindir. Idempotency: (tenant, source, externalId).
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { istToday, parseRange, rangeBounds } from "@/lib/core/report";

export type ExternalPaymentInput = {
  tenantId: string;
  storeId?: string | null;
  source: string;
  externalId: string;
  amount: number;
  currency: string;
  method: string;
  paidAt: Date;
  reference?: string | null;
  meta?: Record<string, unknown>;
  actor: string;
};

export type ExternalPaymentResult =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; error: "store_not_found" };

/** `YYYY-MM` (geçersiz/boşsa bu ay) → Istanbul gün sınırları. */
export function paymentMonth(ay?: string | null) {
  const now = istToday();
  const label = /^\d{4}-(0[1-9]|1[0-2])$/.test(ay ?? "") ? ay! : now.slice(0, 7);
  const [year, month] = label.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const range = parseRange(`${label}-01`, `${label}-${String(last).padStart(2, "0")}`);
  return { label, ...rangeBounds(range) };
}

export async function recordExternalPayment(input: ExternalPaymentInput): Promise<ExternalPaymentResult> {
  return withTenant(input.tenantId, async (tx) => {
    if (input.storeId) {
      const [store] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.id, input.storeId));
      if (!store) return { ok: false as const, error: "store_not_found" as const };
    }
    const E = schema.externalPayments;
    const [inserted] = await tx.insert(E).values({
      tenantId: input.tenantId,
      storeId: input.storeId ?? null,
      source: input.source,
      externalId: input.externalId,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      paidAt: input.paidAt,
      reference: input.reference ?? null,
      meta: input.meta ?? {},
    }).onConflictDoNothing({ target: [E.tenantId, E.source, E.externalId] }).returning({ id: E.id });
    if (inserted) {
      await audit(tx, input.tenantId, input.actor, "integration.external_payment", {
        source: input.source, externalId: input.externalId, amount: input.amount,
        currency: input.currency, method: input.method, storeId: input.storeId ?? null,
      });
      return { ok: true as const, id: inserted.id, duplicate: false };
    }
    const [existing] = await tx.select({ id: E.id }).from(E)
      .where(and(eq(E.source, input.source), eq(E.externalId, input.externalId)));
    return { ok: true as const, id: existing?.id ?? "", duplicate: true };
  });
}
