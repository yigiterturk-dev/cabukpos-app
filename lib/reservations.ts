import { and, asc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb, schema, withTenant, type Tx } from "@/db";
import { validateReservation, timeToAt, freeReservationTables } from "@/lib/core/reservation";
import { isValidCalendarDay, istToday } from "@/lib/core/report";
import { audit } from "@/lib/audit";
import { isPlanId } from "@/lib/core/staff-plan";

export class BookingError extends Error {}
const C = schema.reservationSettings, R = schema.reservations, T = schema.tables, A = schema.areas;
export async function reservationContext(token: string) {
  if (!isPlanId(token)) return null;
  const [settings] = await getDb().select().from(C).where(and(eq(C.token, token), eq(C.enabled, true)));
  return settings ?? null;
}
export async function bookingSettings(ctx: { tenantId: string; storeId: string }) {
  const [s] = await getDb().select().from(C).where(and(eq(C.tenantId, ctx.tenantId), eq(C.storeId, ctx.storeId)));
  return s ?? { ...ctx, enabled: false, token: null, openMinute: 600, closeMinute: 1320, durationMinutes: 90, slotMinutes: 30, advanceDays: 30 };
}
async function tablesFor(tx: Tx, ctx: { tenantId: string; storeId: string }) {
  return tx.select({ id: T.id, name: T.name, seats: T.seats }).from(T).innerJoin(A, eq(A.id, T.areaId)).where(and(eq(T.tenantId, ctx.tenantId), eq(A.storeId, ctx.storeId), eq(T.active, true), gt(T.seats, 0))).orderBy(asc(T.seats), asc(T.id));
}
/** Unassigned legacy bookings reserve a virtual compatible table; never silently overbook them. */
async function freeTables(tx: Tx, ctx: { tenantId: string; storeId: string }, at: Date, duration: number, exceptId?: string) {
  const tables = await tablesFor(tx, ctx);
  const end = new Date(at.getTime() + duration * 60000);
  const occupied = await tx.select({ tableId: R.tableId, guests: R.guests }).from(R).where(and(eq(R.tenantId, ctx.tenantId), eq(R.storeId, ctx.storeId), inArray(R.status, ["bekliyor", "onaylandi", "geldi"]), lt(R.at, end), sql`${R.at} + ${R.durationMinutes} * interval '1 minute' > ${at.toISOString()}::timestamptz`, exceptId ? ne(R.id, exceptId) : undefined));
  return freeReservationTables(tables, occupied);
}
export async function availableBookingSlots(ctx: { tenantId: string; storeId: string }, day: string, guests: number, now = Date.now()) {
  const s = await bookingSettings(ctx);
  const today = istToday(now);
  if (!isValidCalendarDay(day) || !Number.isInteger(guests) || guests < 1 || guests > 99 || day < today || day > istToday(now, s.advanceDays)) return [];
  return withTenant(ctx.tenantId, async tx => {
    const slots: string[] = [];
    const tables = await tablesFor(tx, ctx);
    const from = timeToAt(day, "00:00")!, end = new Date(from.getTime() + 86400000);
    const bookings = await tx.select({ tableId: R.tableId, guests: R.guests, at: R.at, duration: R.durationMinutes }).from(R).where(and(eq(R.tenantId, ctx.tenantId), eq(R.storeId, ctx.storeId), inArray(R.status, ["bekliyor", "onaylandi", "geldi"]), lt(R.at, end), sql`${R.at} + ${R.durationMinutes} * interval '1 minute' > ${from.toISOString()}::timestamptz`)).limit(10001);
    if (bookings.length > 10000) throw new BookingError("Uygunluk sorgu sınırı aşıldı.");
    for (let m = s.openMinute; m + s.durationMinutes <= s.closeMinute; m += s.slotMinutes) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const at = timeToAt(day, time)!;
      if (at.getTime() < now + 15 * 60000) continue;
      const occupied = bookings.filter(r => r.at.getTime() < at.getTime() + s.durationMinutes * 60000 && r.at.getTime() + r.duration * 60000 > at.getTime());
      if (freeReservationTables(tables, occupied).some(t => t.seats >= guests)) slots.push(time);
    }
    return slots;
  });
}
export async function bookReservation(ctx: { tenantId: string; storeId: string }, input: { id?: string; name: string; phone: string; guests: number; note: string; at: Date; durationMinutes?: number; tableId?: string | null }, actor: string, publicBooking = false) {
  const err = validateReservation(input);
  if (err) throw new BookingError(err);
  if (!Number.isFinite(input.at.getTime()) || (input.id && !isPlanId(input.id))) throw new BookingError("Geçersiz rezervasyon.");
  return withTenant(ctx.tenantId, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([ctx.storeId, "reservation"])}))`);
    const [storedSettings] = await tx.select().from(C).where(and(eq(C.tenantId, ctx.tenantId), eq(C.storeId, ctx.storeId)));
    const settings = storedSettings ?? { enabled: false, openMinute: 600, closeMinute: 1320, durationMinutes: 90, slotMinutes: 30, advanceDays: 30 };
    const duration = input.durationMinutes ?? settings.durationMinutes;
    if (!Number.isInteger(duration) || duration < 15 || duration > 360) throw new BookingError("Rezervasyon süresi 15–360 dakika olmalı.");
    if (input.id) {
      const [prior] = await tx.select().from(R).where(and(eq(R.id, input.id), eq(R.tenantId, ctx.tenantId), eq(R.storeId, ctx.storeId)));
      if (prior) {
        if (prior.phone === input.phone && prior.at.getTime() === input.at.getTime() && prior.guests === input.guests && prior.name === input.name.trim()) return prior;
        throw new BookingError("Bu istek daha önce farklı bilgilerle işlendi.");
      }
    }
    if (publicBooking) {
      const local = new Date(input.at.getTime() + 3 * 3600000).toISOString();
      const minute = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
      if (!settings.enabled || input.at.getTime() < Date.now() + 15 * 60000 || local.slice(0, 10) > istToday(Date.now(), settings.advanceDays) || minute < settings.openMinute || minute + duration > settings.closeMinute || (minute - settings.openMinute) % settings.slotMinutes !== 0 || duration !== settings.durationMinutes) throw new BookingError("Bu saat için çevrimiçi rezervasyon alınamıyor.");
    }
    const free = await freeTables(tx, ctx, input.at, duration);
    const table = free.find(t => t.seats >= input.guests && (!input.tableId || t.id === input.tableId));
    if (!table) throw new BookingError("Bu kişi sayısı ve saat için uygun masa yok. Başka saat seçin.");
    const [saved] = await tx.insert(R).values({ id: input.id, ...ctx, name: input.name.trim(), phone: input.phone, guests: input.guests, at: input.at, durationMinutes: duration, tableId: table.id, note: input.note.trim() || null }).returning();
    await audit(tx, ctx.tenantId, actor, "rezervasyon.ekle", { id: saved.id, storeId: ctx.storeId, tableId: table.id, at: input.at.toISOString(), guests: input.guests, source: publicBooking ? "public" : "admin" });
    return saved;
  });
}
export async function changeBookingStatus(ctx: { tenantId: string; storeId: string }, id: string, status: typeof R.$inferSelect["status"], actor: string) {
  return withTenant(ctx.tenantId, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([ctx.storeId, "reservation"])}))`);
    const [r] = await tx.select().from(R).where(and(eq(R.id, id), eq(R.tenantId, ctx.tenantId), eq(R.storeId, ctx.storeId))).for("update");
    if (!r) throw new BookingError("Rezervasyon bulunamadı.");
    let tableId = r.tableId;
    if (["bekliyor", "onaylandi", "geldi"].includes(status)) {
      const free = await freeTables(tx, ctx, r.at, r.durationMinutes, r.id);
      const table = free.find(t => t.seats >= r.guests && (!tableId || t.id === tableId));
      if (!table) throw new BookingError("Bu saat için masa dolu; rezervasyon geri açılamaz.");
      tableId = table.id;
    }
    await tx.update(R).set({ status, tableId }).where(eq(R.id, id));
    await audit(tx, ctx.tenantId, actor, "rezervasyon.durum", { id, storeId: ctx.storeId, status });
  });
}
