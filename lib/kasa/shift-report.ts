// Vardiya raporu verisi (sunucu). Özet saf summarizeShift ile.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { summarizeShift } from "@/lib/core/shift";
import type { PayMethod } from "@/lib/core/payment";
import type { VatLine } from "@/lib/core/cart";

export async function loadShiftSummary(tenantId: string, shiftId: string) {
  return withTenant(tenantId, async (tx) => {
    const [shift] = await tx.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId));
    if (!shift) return null;
    const sales = await tx.select().from(schema.sales).where(eq(schema.sales.shiftId, shiftId)).orderBy(asc(schema.sales.createdAt));
    const pays = sales.length ? await tx.select().from(schema.payments).where(inArray(schema.payments.saleId, sales.map((s) => s.id))) : [];
    const staffIds = [shift.openedBy, ...(shift.closedBy ? [shift.closedBy] : [])];
    const staff = await tx.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(inArray(schema.staff.id, staffIds));
    const closed = sales.filter((s) => s.status === "kapandi" || s.status === "iade");
    const drops = await tx.select({ total: schema.registerEvents.total }).from(schema.registerEvents).where(and(eq(schema.registerEvents.shiftId, shiftId), eq(schema.registerEvents.type, "safe_drop")));
    const summary = summarizeShift(shift.openingCash, closed.map((s) => ({ refund: s.status === "iade", total: s.total, discount: s.discount, change: s.change, vat: s.vat as VatLine[], payments: pays.filter((p) => p.saleId === s.id).map((p) => ({ method: p.method as PayMethod, amount: p.amount })) })), drops.map((d) => d.total));
    const [fe] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.fiscalDocuments).innerJoin(schema.sales, eq(schema.sales.id, schema.fiscalDocuments.saleId))
      .where(and(eq(schema.sales.shiftId, shiftId), eq(schema.fiscalDocuments.status, "error")));
    const name = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "—";
    return { shift, summary, openedByName: name(shift.openedBy), closedByName: name(shift.closedBy), sales: closed.map((s) => ({ id: s.id, receiptNo: s.receiptNo, createdAt: s.createdAt, total: s.status === "iade" ? -s.total : s.total })), fiscalErrors: fe.n };
  });
}
