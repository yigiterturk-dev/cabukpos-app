import { and, asc, eq, gte, inArray, lt, or, isNull } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { isValidCalendarDay } from "@/lib/core/report";
import { summarizeShift, type ShiftSale } from "@/lib/core/shift";
import { csvCell } from "@/lib/core/accounting";

/** Courier cash belongs to a device's shift, never inferred from the order's last payment label. */
export async function courierAccount(ctx: { tenantId: string; storeId: string }, day: string) {
  if (!isValidCalendarDay(day)) throw new Error("Geçersiz tarih.");
  const start = new Date(`${day}T00:00:00+03:00`), end = new Date(start.getTime() + 86400000);
  return withTenant(ctx.tenantId, async tx => {
    const H = schema.shifts, D = schema.devices, F = schema.staff, S = schema.sales, P = schema.payments, R = schema.registerEvents;
    const shifts = await tx.select({ id: H.id, device: D.name, courier: F.name, courierId: F.id, openedAt: H.openedAt, closedAt: H.closedAt, openingCash: H.openingCash, countedCash: H.countedCash, savedExpected: H.expectedCash })
      .from(H).innerJoin(D, eq(D.id, H.deviceId)).innerJoin(F, eq(F.id, H.openedBy))
      .where(and(eq(H.tenantId, ctx.tenantId), eq(H.storeId, ctx.storeId), eq(D.tenantId, ctx.tenantId), eq(D.storeId, ctx.storeId), eq(D.role, "kurye"), lt(H.openedAt, end), or(isNull(H.closedAt), gte(H.closedAt, start))))
      .orderBy(asc(H.openedAt), asc(H.id)).limit(201);
    if (shifts.length > 200) throw new Error("200 vardiya rapor sınırı aşıldı. Şube raporlarını kullanın.");
    const ids = shifts.map(s => s.id);
    const sales = ids.length ? await tx.select().from(S).where(and(eq(S.tenantId, ctx.tenantId), eq(S.storeId, ctx.storeId), inArray(S.shiftId, ids), inArray(S.status, ["kapandi", "iade"]))).orderBy(S.createdAt, S.id).limit(10001) : [];
    if (sales.length > 10000) throw new Error("10.000 işlem rapor sınırı aşıldı.");
    const payments = sales.length ? await tx.select().from(P).where(and(eq(P.tenantId, ctx.tenantId), inArray(P.saleId, sales.map(s => s.id)))).limit(50001) : [];
    const drops = ids.length ? await tx.select().from(R).where(and(eq(R.tenantId, ctx.tenantId), eq(R.storeId, ctx.storeId), inArray(R.shiftId, ids), eq(R.type, "safe_drop"))).limit(10001) : [];
    if (payments.length > 50000 || drops.length > 10000) throw new Error("Rapor hareket sınırı aşıldı.");
    const pays = new Map<string, typeof payments>();
    for (const p of payments) pays.set(p.saleId, [...(pays.get(p.saleId) ?? []), p]);
    const core = (s: typeof sales[number]): ShiftSale => ({ total: s.total, change: s.change, discount: s.discount, refund: s.status === "iade", vat: s.vat as ShiftSale["vat"], payments: (pays.get(s.id) ?? []).map(p => ({ method: p.method, amount: p.amount })) });
    const inDay = (s: typeof sales[number]) => s.createdAt >= start && s.createdAt < end;
    const rows = shifts.map(shift => {
      const all = sales.filter(s => s.shiftId === shift.id);
      const daily = all.filter(inDay);
      const summary = summarizeShift(shift.openingCash, all.map(core), drops.filter(d => d.shiftId === shift.id).map(d => d.total));
      return { ...shift, summary, daily: summarizeShift(0, daily.map(core)), reviewCount: all.filter(s => s.review).length,
        variance: shift.closedAt && shift.countedCash !== null ? shift.countedCash - summary.expectedCash : null,
        changedAfterClose: !!shift.closedAt && shift.savedExpected !== null && shift.savedExpected !== summary.expectedCash };
    });
    return { day, rows, daily: summarizeShift(0, sales.filter(inDay).map(core)), reviewCount: sales.filter(inDay).filter(s => s.review).length };
  });
}

export type CourierAccount = Awaited<ReturnType<typeof courierAccount>>;
export function courierAccountCsv(report: CourierAccount) {
  const rows: (string | number)[][] = [["Rapor günü", "Vardiya sorumlusu", "Cihaz", "Açılış", "Kapanış", "Günlük net nakit", "Günlük net kart", "Günlük online", "Vardiya beklenen nakit", "Sayılan nakit", "Fark", "Kapanış hesabı değişti", "İncelenecek işlem"]];
  const money = (v: number | null) => v === null ? "" : (v / 100).toFixed(2);
  for (const r of report.rows) rows.push([report.day, r.courier, r.device, r.openedAt.toISOString(), r.closedAt?.toISOString() ?? "Açık", money(r.daily.byMethod.nakit), money(r.daily.byMethod.kart), money(r.daily.byMethod.online), money(r.summary.expectedCash), money(r.countedCash), money(r.variance), r.changedAfterClose ? "Evet" : "Hayır", r.reviewCount]);
  return "\ufeff" + rows.map(row => row.map(v => csvCell(v, ";")).join(";")).join("\r\n") + "\r\n";
}
