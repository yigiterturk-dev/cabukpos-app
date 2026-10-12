// lib/sync/lookup.ts — İade için fiş sorgusu (kiracı geneli): kapanmış satış + iade edilebilir satırlar.
// Fiş çakışması politikası (#25): bulut çakışan fişi "-N" ile yeniden adlandırır ama kasaya basılan
// fişte çekirdek numara yazar. Tam eşleşme yoksa çekirdek numaranın "-N" ikizlerinin en eskisine bakılır;
// tam eşleşme varsa o kazanır (ikiz yalnız kendi numarasıyla bulunur).
import { and, asc, eq, like } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { refundable, type RefLine } from "@/lib/core/refund";
import { buyerKindOf, type FiscalBuyerKind } from "@/lib/core/refundNote";
import { soldLines } from "./apply";

/** fiscal: asıl satışın kesilmiş e-Arşiv faturası (iade tutanağı için); yoksa null. */
export type SaleFiscalRef = { number: string; ettn: string; invoiceAt: string; buyerKind: FiscalBuyerKind; refundedBefore: boolean };
/** #33: discount/goodsTotal — iade tutarının indirim payı oransal düşülsün (müşteri ödediğinden fazlasını almasın). */
export type LookedUpSale = { id: string; receiptNo: string; at: string; lines: RefLine[]; fiscal: SaleFiscalRef | null; fiscalPending?: boolean; discount: number; goodsTotal: number };

export async function lookupSale(tenantId: string, receiptNo: string): Promise<LookedUpSale | null> {
  return withTenant(tenantId, async (tx) => {
    const core = /^(.*-\d{6})/.exec(receiptNo)?.[1] ?? receiptNo;
    const rowFor = async (no: string, prefix: boolean) => {
      const [s] = await tx
        .select({ id: schema.sales.id, receiptNo: schema.sales.receiptNo, at: schema.sales.createdAt, total: schema.sales.total, tip: schema.sales.tip, discount: schema.sales.discount })
        .from(schema.sales)
        .where(and(prefix ? like(schema.sales.receiptNo, no) : eq(schema.sales.receiptNo, no), eq(schema.sales.status, "kapandi")))
        .orderBy(asc(schema.sales.createdAt))
        .limit(1);
      return s ?? null;
    };
    const s = (await rowFor(receiptNo, false)) ?? (await rowFor(`${core}-%`, true));
    if (!s) return null;
    const sold = await soldLines(tx, s.id);
    if (!sold) return null;
    const D = schema.fiscalDocuments;
    const [doc] = await tx.select({ number: D.number, ettn: D.ettn, issuedAt: D.issuedAt, buyer: D.buyer }).from(D).where(and(eq(D.saleId, s.id), eq(D.status, "issued")));
    const fiscal = doc?.number && doc.ettn && doc.issuedAt ? { number: doc.number, ettn: doc.ettn, invoiceAt: doc.issuedAt.toISOString(), buyerKind: buyerKindOf(doc.buyer?.taxId), refundedBefore: sold.refunded.length > 0 } : null;
    return { id: s.id, receiptNo: s.receiptNo, at: s.at.toISOString(), lines: refundable(sold.lines, sold.refunded), fiscal, discount: s.discount, goodsTotal: s.total - s.tip };
  });
}
