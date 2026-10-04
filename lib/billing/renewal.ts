// lib/billing/renewal.ts — #11: saklanan kartla otomatik abonelik yenileme.
// Vade ≤3 gün kala ayelik dönem için çekim dener; başarısızsa ödeme "basarisiz" kalır (dunning akışı devralır),
// aynı kiracıya 24 saat içinde ikinci deneme yapılmaz. Hata her durumda günlüğe yazılır, cron asla fırlatmaz.
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptCardToken } from "./card-vault";
import { getBillingProvider } from "./provider";
import { planPriceFor } from "./plans";
import { createPayment, completePayment, tenantUnits } from "./service";

const RETRY_AFTER_MS = 24 * 86_400_000;

export type RenewResult = { attempted: number; ok: number; failed: number; skipped: number };

export async function renewDue(now = new Date()): Promise<RenewResult> {
  const out: RenewResult = { attempted: 0, ok: 0, failed: 0, skipped: 0 };
  const provider = getBillingProvider();
  if (!provider?.chargeStored) return out;
  const T = schema.tenants, P = schema.billingPayments;
  const due = await getDb().select({ id: T.id, cardToken: T.cardToken })
    .from(T)
    .where(and(isNotNull(T.cardToken), isNotNull(T.paidUntil), sql`${T.paidUntil} < now() + interval '3 days'`, sql`(${T.paidUntil} is null or ${T.paidUntil} > now() - interval '40 days')`));
  for (const t of due) {
    try {
      // Son 24 saatteki başarısız deneme varsa bugün dokunma (ağ/sağlayıcı detayına geri dönmeden).
      const [last] = await getDb().select({ status: P.status, createdAt: P.createdAt }).from(P)
        .where(and(eq(P.tenantId, t.id), eq(P.provider, provider.name), eq(P.period, "aylik"))).orderBy(desc(P.createdAt)).limit(1);
      if (last && last.status === "basarisiz" && now.getTime() - last.createdAt.getTime() < RETRY_AFTER_MS) { out.skipped++; continue; }
      const units = await tenantUnits(t.id);
      const amount = planPriceFor("aylik", units);
      if (!amount) { out.skipped++; continue; }
      const plain = decryptCardToken(t.cardToken!);
      if (!plain) { out.skipped++; continue; } // anahtar değişmiş/bozuk satır — sessiz atla
      const p = await createPayment(t.id, provider.name, "aylik", amount, units);
      out.attempted++;
      const r = await provider.chargeStored(plain, amount, p.id);
      const done = await completePayment(p.id, r.ok, `renew-${r.ok ? "ok" : (r.error ?? "hata")}`);
      if (done === "odendi") out.ok++;
      else { out.failed++; console.error("[renewal] başarısız", t.id, r.error); }
    } catch (e) {
      out.failed++;
      console.error("[renewal] istisna", t.id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** #11: Saklanan kartı kaldır (kullanıcı isteği). Yenileme bundan sonra çalışmaz. */
export async function removeStoredCard(tenantId: string): Promise<void> {
  await getDb().update(schema.tenants).set({ cardToken: null, cardMark: null }).where(and(eq(schema.tenants.id, tenantId), isNotNull(schema.tenants.cardToken)));
}

/** Ödeme başarısında PayTR bildiriminden gelen kart jetonunu kaydet (kart saklama açıksa bildirim card_token taşır). */
export async function saveCardToken(tenantId: string, cardToken: string, cardMark: string | null): Promise<boolean> {
  const enc = (await import("./card-vault")).encryptCardToken(cardToken);
  if (!enc) return false;
  await getDb().update(schema.tenants).set({ cardToken: enc, ...(cardMark ? { cardMark } : {}) }).where(eq(schema.tenants.id, tenantId));
  return true;
}
