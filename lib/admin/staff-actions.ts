"use server";
// Kasa personeli: ad, rol, PIN. PIN kimliği belirler → aynı kiracıda iki aktif kişi aynı PIN'i taşıyamaz.
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { hashPin, pinProblem, verifyPin } from "@/lib/auth/pin";
import { checkReauth } from "@/lib/auth/reauth";
import { audit } from "@/lib/audit";
import { STAFF_PERMISSIONS, type StaffPermissions } from "@/lib/core/staff-permissions";

export type StaffState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveStaff(id: string | null, _: StaffState, form: FormData): Promise<StaffState> {
  const a = await requireWriter();
  if (id && !UUID.test(id)) return { error: "Personel bulunamadı." };
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "kasiyer");
  const pin = String(form.get("pin") ?? "").trim();
  const permissions: StaffPermissions | null = form.get("customPermissions") === "on" ? Object.fromEntries(Object.keys(STAFF_PERMISSIONS).map(k => [k, form.getAll("permission").includes(k)])) : null;
  if (name.length < 2 || name.length > 60) return { error: "Ad 2-60 karakter.", field: "name" };
  if (!["kasiyer", "mudur", "garson", "kurye"].includes(role)) return { error: "Rol geçersiz.", field: "role" };
  // PIN isteğe bağlı: boş = kasada adına dokunarak girer (pinHash "").
  const removePin = !pin && form.get("removePin") === "on";
  if (pin) {
    const p = pinProblem(pin);
    if (p) return { error: p, field: "pin" };
  }
  // Hassas işlem (#8): mevcut personelin rolü/PIN'i değişirken hesap şifresi yeniden sorulur.
  let reauthErr: string | null = null;
  if (id) {
    const [onceki] = await withTenant(a.tenantId, (tx) => tx.select({ role: schema.staff.role, permissions: schema.staff.permissions }).from(schema.staff).where(eq(schema.staff.id, id)));
    if (!onceki) return { error: "Personel bulunamadı." };
    if (onceki.role !== role || pin || removePin || Object.keys(STAFF_PERMISSIONS).some(k => onceki.permissions?.[k as keyof StaffPermissions] !== permissions?.[k as keyof StaffPermissions])) reauthErr = await checkReauth(a.id, form);
  }
  if (reauthErr) return { error: reauthErr, field: "sifre" };
  const err = await withTenant(a.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${a.tenantId}), 9271)`);
    if (pin) {
      const others = await tx.select({ pinHash: schema.staff.pinHash }).from(schema.staff).where(id ? and(eq(schema.staff.active, true), ne(schema.staff.id, id)) : eq(schema.staff.active, true));
      for (const o of others) if (await verifyPin(pin, o.pinHash)) return "Bu PIN başka birinde kullanılıyor.";
    }
    const set = { name, permissions, role: role as "kasiyer" | "mudur" | "garson" | "kurye", ...(pin ? { pinHash: await hashPin(pin) } : removePin ? { pinHash: "" } : {}) };
    if (id) {
      const [row] = await tx.update(schema.staff).set(set).where(eq(schema.staff.id, id)).returning({ id: schema.staff.id });
      if (!row) return "Personel bulunamadı.";
    } else {
      await tx.insert(schema.staff).values({ tenantId: a.tenantId, name, permissions, role: set.role, pinHash: set.pinHash ?? "" });
    }
    await audit(tx, a.tenantId, `user:${a.id}`, "staff.save", { id, name, role, permissions, pinChanged: Boolean(pin) || removePin });
    return null;
  });
  if (err) return { error: err, field: "pin" };
  revalidatePath("/yonetim/personel");
  return { savedAt: Date.now() };
}

export async function setStaffActive(id: string, active: boolean) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.staff).set({ active: active === true }).where(eq(schema.staff.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "staff.active", { id, active });
  });
  revalidatePath("/yonetim/personel");
}
