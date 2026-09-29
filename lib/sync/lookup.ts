// lib/sync/lookup.ts — İade için fiş sorgusu (kiracı geneli): kapanmış satış + iade edilebilir satırlar.
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { refundable, type RefLine } from "@/lib/core/refund";
import { buyerKindOf } from "@/lib/core/refundNote";
import { soldLines } from "./apply";

/** fiscal: asıl satışın kesilmiş e-Arşiv faturası (iade tutanağı için); yoksa null. */
export type SaleFiscalRef = { number: string; ettn: string; invoiceAt: string; buyerKind: "tckn" | "vkn"; refundedBefore: boolean };
export type LookedUpSale = { id: string; receiptNo: string; at: string; lines: RefLine[]; fiscal: SaleFiscalRef | null; fiscalPending?: boolean };

export async function lookupSale(tenantId: string, receiptNo: string): Promise<LookedUpSale | null> {
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select({ id: schema.sales.id, receiptNo: schema.sales.receiptNo, at: schema.sales.createdAt }).from(schema.sales).where(and(eq(schema.sales.receiptNo, receiptNo), eq(schema.sales.status, "kapandi"))).limit(1);
    if (!s) return null;
    const sold = await soldLines(tx, s.id);
    if (!sold) return null;
    const D = schema.fiscalDocuments;
    const [doc] = await tx.select({ number: D.number, ettn: D.ettn, issuedAt: D.issuedAt, buyer: D.buyer }).from(D).where(and(eq(D.saleId, s.id), eq(D.status, "issued")));
    const fiscal = doc?.number && doc.ettn && doc.issuedAt ? { number: doc.number, ettn: doc.ettn, invoiceAt: doc.issuedAt.toISOString(), buyerKind: buyerKindOf(doc.buyer?.taxId), refundedBefore: sold.refunded.length > 0 } : null;
    return { id: s.id, receiptNo: s.receiptNo, at: s.at.toISOString(), lines: refundable(sold.lines, sold.refunded), fiscal };
  });
}
