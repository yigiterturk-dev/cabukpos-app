// lib/sync/lookup.ts — İade için fiş sorgusu (kiracı geneli): kapanmış satış + iade edilebilir satırlar.
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { refundable, type RefLine } from "@/lib/core/refund";
import { soldLines } from "./apply";

export type LookedUpSale = { id: string; receiptNo: string; at: string; lines: RefLine[] };

export async function lookupSale(tenantId: string, receiptNo: string): Promise<LookedUpSale | null> {
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select({ id: schema.sales.id, receiptNo: schema.sales.receiptNo, at: schema.sales.createdAt }).from(schema.sales).where(and(eq(schema.sales.receiptNo, receiptNo), eq(schema.sales.status, "kapandi"))).limit(1);
    if (!s) return null;
    const sold = await soldLines(tx, s.id);
    return sold && { id: s.id, receiptNo: s.receiptNo, at: s.at.toISOString(), lines: refundable(sold.lines, sold.refunded) };
  });
}
