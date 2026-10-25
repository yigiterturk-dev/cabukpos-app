"use server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { scopedStoreId } from "./store-scope";
import { audit } from "@/lib/audit";
export type BookingConfigState = { error?: string; savedAt?: number };
async function ctx() {
  const a = await requireWriter();
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) throw new Error("Şube bulunamadı.");
  return { ...a, storeId };
}
export async function saveBookingConfig(_: BookingConfigState, form: FormData): Promise<BookingConfigState> {
  const a = await ctx();
  const toMinute = (name: string) => { const raw = String(form.get(name) ?? ""); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return NaN; return Number(raw.slice(0,2)) * 60 + Number(raw.slice(3,5)); };
  const values = { enabled: form.get("enabled") === "on", openMinute: toMinute("openTime"), closeMinute: toMinute("closeTime") || (String(form.get("closeTime")) === "00:00" ? 1440 : NaN), durationMinutes: Number(form.get("durationMinutes")), slotMinutes: Number(form.get("slotMinutes")), advanceDays: Number(form.get("advanceDays")) };
  if (!Object.values(values).every(v => typeof v === "boolean" || Number.isInteger(v)) || values.openMinute < 0 || values.closeMinute > 1440 || values.closeMinute - values.openMinute < values.durationMinutes || values.durationMinutes < 15 || values.durationMinutes > 360 || ![15, 30, 60].includes(values.slotMinutes) || values.advanceDays < 1 || values.advanceDays > 90) return { error: "Saat, süre ve gün sınırlarını kontrol edin." };
  await withTenant(a.tenantId, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([a.storeId, "reservation"])}))`);
    const C = schema.reservationSettings;
    const [existing] = await tx.select({ id: C.storeId }).from(C).where(and(eq(C.storeId, a.storeId), eq(C.tenantId, a.tenantId)));
    if (existing) await tx.update(C).set(values).where(and(eq(C.storeId, a.storeId), eq(C.tenantId, a.tenantId)));
    else await tx.insert(C).values({ tenantId: a.tenantId, storeId: a.storeId, ...values });
    await audit(tx, a.tenantId, `user:${a.id}`, "reservation.settings", { storeId: a.storeId, ...values });
  });
  revalidatePath("/yonetim/rezervasyonlar/ayarlar");
  return { savedAt: Date.now() };
}
export async function saveTableCapacity(_: BookingConfigState, form: FormData): Promise<BookingConfigState> {
  const a = await ctx(), id = String(form.get("id")), seats = Number(form.get("seats"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(seats) || seats < 0 || seats > 99) return { error: "Kapasite 0–99 arasında olmalı." };
  const error = await withTenant(a.tenantId, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([a.storeId, "reservation"])}))`);
    const T = schema.tables, A = schema.areas, R = schema.reservations;
    const [table] = await tx.select({ id: T.id }).from(T).innerJoin(A, eq(A.id, T.areaId)).where(and(eq(T.id, id), eq(T.tenantId, a.tenantId), eq(A.storeId, a.storeId)));
    if (!table) return "Masa bulunamadı.";
    const [booked] = await tx.select({ id: R.id }).from(R).where(and(eq(R.tableId, id), eq(R.tenantId, a.tenantId), eq(R.storeId, a.storeId), gt(R.guests, seats), gt(R.at, new Date()), inArray(R.status, ["bekliyor", "onaylandi", "geldi"]))).limit(1);
    if (booked) return "Bu kapasiteyi aşan gelecek rezervasyon var. Önce rezervasyonu düzenleyin veya iptal edin.";
    await tx.update(T).set({ seats }).where(and(eq(T.id, id), eq(T.tenantId, a.tenantId)));
    await audit(tx, a.tenantId, `user:${a.id}`, "table.capacity", { id, storeId: a.storeId, seats });
    return null;
  });
  if (error) return { error };
  revalidatePath("/yonetim/rezervasyonlar/ayarlar");
  return { savedAt: Date.now() };
}
