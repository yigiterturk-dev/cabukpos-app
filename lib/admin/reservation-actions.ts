"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { RES_STATUSES, timeToAt, type ResStatus } from "@/lib/core/reservation";
import { canUseStore } from "@/lib/core/access";
import { BookingError, bookReservation, changeBookingStatus } from "@/lib/reservations";
import { isPlanId } from "@/lib/core/staff-plan";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export type ResState = { error?: string; field?: string; savedAt?: number; requestId?: string };
export async function createReservation(previous: ResState, form: FormData): Promise<ResState> {
  const a = await requireWriter();
  const fail = (error: string, field?: string): ResState => ({ error, field, savedAt: previous.savedAt, requestId: previous.requestId });
  const storeId = str(form, "storeId"), at = timeToAt(str(form, "day"), str(form, "time"));
  if (!isPlanId(storeId) || !canUseStore(a, storeId)) return fail("Bu şubede rezervasyon oluşturamazsınız.");
  if (!at) return fail("Geçerli tarih ve saat girin.", "time");
  try {
    await bookReservation({ tenantId: a.tenantId, storeId }, { id: str(form, "requestId") || undefined, name: str(form, "name"), phone: str(form, "phone").replace(/\D/g, ""), guests: Number(str(form, "guests")), note: str(form, "note"), at, durationMinutes: str(form, "duration") ? Number(str(form, "duration")) : undefined, tableId: str(form, "tableId") || null }, `user:${a.id}`);
  } catch (e) { return fail(e instanceof BookingError ? e.message : "Rezervasyon kaydedilemedi."); }
  revalidatePath("/yonetim/rezervasyonlar");
  return { savedAt: Date.now(), requestId: randomUUID() };
}
export async function setReservationStatus(_: ResState, form: FormData): Promise<ResState> {
  const a = await requireWriter();
  const id = str(form, "id"), status = str(form, "status");
  if (!isPlanId(id) || !(RES_STATUSES as readonly string[]).includes(status)) return { error: "Geçersiz rezervasyon durumu." };
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) return { error: "Şube bulunamadı." };
  try { await changeBookingStatus({ tenantId: a.tenantId, storeId }, id, status as ResStatus, `user:${a.id}`); }
  catch (e) { return { error: e instanceof BookingError ? e.message : "Rezervasyon durumu kaydedilemedi." }; }
  revalidatePath("/yonetim/rezervasyonlar");
  return { savedAt: Date.now() };
}
