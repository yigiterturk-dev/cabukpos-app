import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { canManageUsers, type AccessActor } from "@/lib/core/access";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import { newPairingCode } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";
import { setupPinProblem } from "./setup-pin";

type SetupInput = { name: string; deviceName: string; pin: string; confirmation: string; storeId: string | null; tokenHash: string; current: { id: string; tenantId: string; storeId: string } | null };

export async function setupRegister(tx: Tx, tenantId: string, actor: AccessActor & { id: string }, input: SetupInput): Promise<{ error: string } | { ok: true }> {
  if (!canManageUsers(actor)) return { error: "Kasa kurulumu için işletme sahibi veya HQ hesabı gerekli." };
  const problem = setupPinProblem(input.pin, input.confirmation);
  if (problem) return { error: problem };
  if (input.name.length < 2 || input.name.length > 60 || input.deviceName.length < 2 || input.deviceName.length > 40) return { error: "Ad veya kasa adı geçersiz." };
  if (input.current && input.current.tenantId !== tenantId) return { error: "Cihaz başka işletmeye bağlı." };
  if (input.current) {
    const [device] = await tx.select({ id: schema.devices.id }).from(schema.devices).where(and(
      eq(schema.devices.id, input.current.id), eq(schema.devices.tenantId, tenantId),
      eq(schema.devices.storeId, input.storeId ?? "00000000-0000-0000-0000-000000000000"), isNull(schema.devices.revokedAt)));
    if (!device) return { error: "Mevcut kasa eşlemesi geçersiz. Yöneticinizle kontrol edin." };
  }
  // Serialize setup/PIN uniqueness checks for this tenant.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), 9271)`);
  const { storeId, name, deviceName, pin, tokenHash, current } = input;
  const [store] = storeId ? await tx.select({ kind: schema.stores.kind }).from(schema.stores).where(eq(schema.stores.id, storeId)) : [];
  if (!store || store.kind !== "sube") return { error: "Önce satış yapılan bir şube seçin; depo kasaya bağlanamaz." };
  const staff = await tx.select().from(schema.staff).where(eq(schema.staff.active, true));
  let existing: string | null = null;
  for (const person of staff) {
    if (pin && await verifyPin(pin, person.pinHash)) {
      if (person.name === name && person.role === "mudur") existing = person.id;
      else return { error: "Bu PIN başka bir personelde kullanılıyor. Farklı bir PIN seçin." };
    }
  }
  // Kayıtta PIN'siz eklenen sahip (aynı ad, müdür) yeniden kullanılır; PIN girildiyse ona atanır.
  const ownerNoPin = existing ? null : staff.find(person => person.name === name && person.role === "mudur" && (person.pinHash === "" || !pin));
  if (ownerNoPin) existing = ownerNoPin.id;
  if (!existing && staff.some(person => person.name === name)) return { error: "Bu adla personel zaten var. PIN’inizi Personel → Düzenle’den hesap şifrenizle değiştirin." };
  // Create the device before the staff row; a prefix failure leaves no partial user.
  let deviceId = current?.id;
  if (!current) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const [device] = await tx.insert(schema.devices).values({ tenantId: tenantId, storeId: storeId!, name: deviceName,
        receiptPrefix: newPairingCode().slice(0, 4), tokenHash, pairedAt: new Date(), tokenRotatedAt: new Date(), lastSeenAt: new Date(), role: "kasa" })
        .onConflictDoNothing().returning({ id: schema.devices.id });
      if (device) { deviceId = device.id; break; }
    }
    if (!deviceId) return { error: "Kasa oluşturulamadı. Yeniden deneyin." };
  }
  if (!existing) await tx.insert(schema.staff).values({ tenantId: tenantId, name, role: "mudur", pinHash: pin ? await hashPin(pin) : "" });
  else if (ownerNoPin && pin) await tx.update(schema.staff).set({ pinHash: await hashPin(pin) }).where(eq(schema.staff.id, existing));
  await audit(tx, tenantId, `user:${actor.id}`, "register.self_setup", { deviceId, reusedStaff: Boolean(existing) });
  return { ok: true };
}
