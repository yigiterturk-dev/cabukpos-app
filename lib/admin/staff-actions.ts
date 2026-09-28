"use server";
// Kasa personeli: ad, rol, PIN. PIN kimliği belirler → aynı kiracıda iki aktif kişi aynı PIN'i taşıyamaz.
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { hashPin, pinProblem, verifyPin } from "@/lib/auth/pin";
import { audit } from "@/lib/audit";

export type StaffState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveStaff(id: string | null, _: StaffState, form: FormData): Promise<StaffState> {
  const a = await requireAdmin();
  if (id && !UUID.test(id)) return { error: "Personel bulunamadı." };
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "kasiyer");
  const pin = String(form.get("pin") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { error: "Ad 2-60 karakter.", field: "name" };
  if (role !== "kasiyer" && role !== "mudur" && role !== "garson") return { error: "Rol geçersiz.", field: "role" };
  if (!id || pin) {
    const p = pinProblem(pin);
    if (p) return { error: p, field: "pin" };
  }
  const err = await withTenant(a.tenantId, async (tx) => {
    if (pin) {
      const others = await tx.select({ pinHash: schema.staff.pinHash }).from(schema.staff).where(id ? and(eq(schema.staff.active, true), ne(schema.staff.id, id)) : eq(schema.staff.active, true));
      for (const o of others) if (await verifyPin(pin, o.pinHash)) return "Bu PIN başka birinde kullanılıyor.";
    }
    const set = { name, role: role as "kasiyer" | "mudur" | "garson", ...(pin ? { pinHash: await hashPin(pin) } : {}) };
    if (id) {
      const [row] = await tx.update(schema.staff).set(set).where(eq(schema.staff.id, id)).returning({ id: schema.staff.id });
      if (!row) return "Personel bulunamadı.";
    } else {
      await tx.insert(schema.staff).values({ tenantId: a.tenantId, name, role: set.role, pinHash: set.pinHash! });
    }
    await audit(tx, a.tenantId, `user:${a.id}`, "staff.save", { id, name, role, pinChanged: Boolean(pin) });
    return null;
  });
  if (err) return { error: err, field: "pin" };
  revalidatePath("/yonetim/personel");
  return { savedAt: Date.now() };
}

export async function setStaffActive(id: string, active: boolean) {
  const a = await requireAdmin();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.staff).set({ active: active === true }).where(eq(schema.staff.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "staff.active", { id, active });
  });
  revalidatePath("/yonetim/personel");
}
