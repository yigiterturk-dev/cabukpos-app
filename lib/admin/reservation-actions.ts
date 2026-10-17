"use server";
// #49: rezervasyon eylemleri (sahip/müdür/garson — requireWriter).
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { RES_STATUSES, timeToAt, validateReservation, type ResStatus } from "@/lib/core/reservation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResState = { error?: string; field?: string; savedAt?: number };

export async function createReservation(_: ResState, form: FormData): Promise<ResState> {
  const a = await requireWriter();
  const v = { name: str(form, "name"), phone: str(form, "phone").replace(/\D/g, ""), guests: Number(str(form, "guests")), note: str(form, "note") };
  const err = validateReservation(v);
  if (err) {
    const field = !v.name.trim() || v.name.trim().length > 120 ? "name"
      : !/^\d{6,15}$/.test(v.phone) ? "phone"
      : !Number.isInteger(v.guests) || v.guests < 1 || v.guests > 99 ? "guests"
      : "note";
    return { error: err, field };
  }
  const at = timeToAt(str(form, "day"), str(form, "time"));
  if (!at) return { error: "Tarih/saat geçersiz.", field: "time" };
  const storeId = str(form, "storeId");
  if (!UUID.test(storeId)) return { error: "Şube seçin." };
  const tableId = str(form, "tableId");
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.reservations).values({
      tenantId: a.tenantId, storeId, name: v.name.trim(), phone: v.phone, guests: v.guests, at,
      tableId: UUID.test(tableId) ? tableId : null, note: v.note || null,
    });
    await audit(tx, a.tenantId, `user:${a.id}`, "rezervasyon.ekle", { name: v.name, at: at.toISOString(), guests: v.guests });
  });
  revalidatePath("/yonetim/rezervasyonlar");
  return { savedAt: Date.now() };
}

export async function setReservationStatus(form: FormData): Promise<void> {
  const a = await requireWriter();
  const id = str(form, "id"), status = str(form, "status");
  if (!UUID.test(id) || !(RES_STATUSES as readonly string[]).includes(status)) return;
  await withTenant(a.tenantId, async (tx) => {
    const r = await tx.update(schema.reservations).set({ status: status as ResStatus }).where(and(eq(schema.reservations.id, id))).returning({ id: schema.reservations.id });
    if (r.length) await audit(tx, a.tenantId, `user:${a.id}`, "rezervasyon.durum", { id, status });
  });
  revalidatePath("/yonetim/rezervasyonlar");
}
