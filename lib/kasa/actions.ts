"use server";
// Kasa eylemleri: eşleme, PIN girişi/çıkışı, vardiya açma/kapama, satış.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { clearCashier, getCashier, getDevice, setCashier, setDeviceCookie } from "@/lib/auth/kasa";
import { newDeviceToken, sha256 } from "@/lib/auth/tokens";
import { verifyPin } from "@/lib/auth/pin";
import { parseTL } from "@/lib/core/money";
import { PAY_METHODS, type Payment } from "@/lib/core/payment";
import { clientIp, hit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { recordSale, type SaleInput, type SaleResult } from "./sale";
import { loadShiftSummary } from "./shift-report";

export type KasaState = { error?: string; field?: string };

export async function pairDevice(_: KasaState, form: FormData): Promise<KasaState> {
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/\s/g, "");
  if ((await hit(`pair:${await clientIp()}`)) > 10) return { error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin.", field: "code" };
  if (!/^[A-Z2-9]{8}$/.test(code)) return { error: "Kod geçersiz ya da süresi dolmuş.", field: "code" };
  const token = newDeviceToken();
  const d = schema.devices;
  const [row] = await getDb()
    .update(d)
    .set({ tokenHash: await sha256(token), pairingCode: null, pairingExpiresAt: null, pairedAt: sql`now()`, lastSeenAt: sql`now()` })
    .where(and(eq(d.pairingCode, code), sql`${d.pairingExpiresAt} > now()`, isNull(d.revokedAt)))
    .returning({ id: d.id, tenantId: d.tenantId });
  if (!row) return { error: "Kod geçersiz ya da süresi dolmuş.", field: "code" };
  await withTenant(row.tenantId, (tx) => audit(tx, row.tenantId, `device:${row.id}`, "device.paired"));
  await setDeviceCookie(token);
  await clearCashier();
  redirect("/kasa");
}

export async function pinLogin(_: KasaState, form: FormData): Promise<KasaState> {
  const device = await getDevice();
  if (!device) redirect("/kasa/eslestir");
  const pin = String(form.get("pin") ?? "");
  if ((await hit(`pin:${device.id}`)) > 10) return { error: "Çok fazla yanlış deneme. 15 dakika sonra tekrar deneyin." };
  const staff = await withTenant(device.tenantId, (tx) => tx.select({ id: schema.staff.id, pinHash: schema.staff.pinHash }).from(schema.staff).where(eq(schema.staff.active, true)));
  let found: string | null = null;
  for (const s of staff) if (await verifyPin(pin, s.pinHash)) { found = s.id; break; }
  if (!found) return { error: "PIN hatalı." };
  await getDb().delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, `pin:${device.id}`));
  await setCashier(found, device);
  redirect("/kasa");
}

export async function pinLogout() {
  await clearCashier();
  redirect("/kasa");
}

async function kasaCtx() {
  const device = await getDevice();
  if (!device) return null;
  const cashier = await getCashier(device);
  return cashier ? { device, cashier } : null;
}

export async function openShiftAction(_: KasaState, form: FormData): Promise<KasaState> {
  const ctx = await kasaCtx();
  if (!ctx) redirect("/kasa");
  const cash = parseTL(String(form.get("openingCash") ?? ""));
  if (cash === null) return { error: "Tutar geçersiz (ör. 500 ya da 500,00).", field: "openingCash" };
  const { device, cashier } = ctx;
  const err = await withTenant(device.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${device.id}))`);
    const [open] = await tx.select({ id: schema.shifts.id }).from(schema.shifts).where(and(eq(schema.shifts.deviceId, device.id), isNull(schema.shifts.closedAt)));
    if (open) return "Bu cihazda zaten açık vardiya var.";
    await tx.insert(schema.shifts).values({ tenantId: device.tenantId, storeId: device.storeId, deviceId: device.id, openedBy: cashier.staffId, openingCash: cash });
    await audit(tx, device.tenantId, `staff:${cashier.staffId}`, "shift.open", { deviceId: device.id, openingCash: cash });
    return null;
  });
  if (err) return { error: err };
  redirect("/kasa");
}

/** Satış: istemciden gelen biçim sıkı doğrulanır, fiyatlar sunucudan (recordSale). */
export async function completeSale(input: SaleInput): Promise<SaleResult> {
  const ctx = await kasaCtx();
  if (!ctx) return { ok: false, error: "Oturum kapanmış; PIN ile yeniden girin." };
  const okShape =
    input && typeof input.id === "string" && Array.isArray(input.lines) && Array.isArray(input.payments) && input.lines.length <= 500 && input.payments.length <= 10 &&
    input.lines.every((l) => typeof l?.productId === "string" && Number.isInteger(l.qtyMilli)) &&
    input.payments.every((p: Payment) => PAY_METHODS.some((m) => m.value === p?.method) && Number.isInteger(p.amount));
  if (!okShape) return { ok: false, error: "Geçersiz satış verisi." };
  const clean: SaleInput = { id: input.id, lines: input.lines.map((l) => ({ productId: l.productId, qtyMilli: l.qtyMilli })), payments: input.payments.map((p) => ({ method: p.method, amount: p.amount })) };
  return recordSale({ tenantId: ctx.device.tenantId, storeId: ctx.device.storeId, deviceId: ctx.device.id, staffId: ctx.cashier.staffId, receiptPrefix: ctx.device.receiptPrefix }, clean);
}

export async function closeShiftAction(_: KasaState, form: FormData): Promise<KasaState & { closedShiftId?: string }> {
  const ctx = await kasaCtx();
  if (!ctx) redirect("/kasa");
  const counted = parseTL(String(form.get("countedCash") ?? ""));
  if (counted === null) return { error: "Sayılan nakit geçersiz.", field: "countedCash" };
  const { device, cashier } = ctx;
  const [shift] = await withTenant(device.tenantId, (tx) => tx.select({ id: schema.shifts.id }).from(schema.shifts).where(and(eq(schema.shifts.deviceId, device.id), isNull(schema.shifts.closedAt))).orderBy(desc(schema.shifts.openedAt)).limit(1));
  if (!shift) return { error: "Açık vardiya yok." };
  const rep = await loadShiftSummary(device.tenantId, shift.id);
  await withTenant(device.tenantId, async (tx) => {
    await tx.update(schema.shifts).set({ closedAt: sql`now()`, closedBy: cashier.staffId, countedCash: counted, expectedCash: rep!.summary.expectedCash }).where(and(eq(schema.shifts.id, shift.id), isNull(schema.shifts.closedAt)));
    await audit(tx, device.tenantId, `staff:${cashier.staffId}`, "shift.close", { shiftId: shift.id, counted, expected: rep!.summary.expectedCash });
  });
  await clearCashier();
  revalidatePath("/kasa");
  return { closedShiftId: shift.id };
}
