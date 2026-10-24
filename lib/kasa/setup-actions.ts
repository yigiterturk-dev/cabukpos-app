"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { DEVICE_COOKIE, getDevice, setDeviceCookie } from "@/lib/auth/kasa";
import { newDeviceToken, sha256 } from "@/lib/auth/tokens";
import { canManageUsers } from "@/lib/core/access";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { setupPinProblem } from "./setup-pin";
import { setupRegister } from "./setup";

export type SetupState = { error?: string };

/** Release only this browser's cookie, never revoke or modify the old business/device. */
export async function releaseBrowserRegister(expectedDeviceId: string): Promise<SetupState> {
  const admin = await requireWriter();
  if (!canManageUsers(admin)) return { error: "İşletme sahibi veya HQ hesabı gerekli." };
  const current = await getDevice();
  if (!current) return {};
  if (current.id !== expectedDeviceId) return { error: "Kasa eşlemesi değişti. Sayfayı yenileyip tekrar deneyin." };
  const { cookies } = await import("next/headers");
  (await cookies()).delete(DEVICE_COOKIE);
  revalidatePath("/kasa/kurulum");
  return {};
}

/** Authenticated owner/HQ creates their own PIN; never resets another staff PIN. */
export async function setupOwnRegister(_: SetupState, form: FormData): Promise<SetupState> {
  const a = await requireWriter();
  if (!canManageUsers(a)) return { error: "Kasa kurulumu için işletme sahibi veya HQ hesabı gerekli." };
  const name = String(form.get("name") ?? "").trim();
  const deviceName = String(form.get("deviceName") ?? "").trim();
  const pin = String(form.get("pin") ?? "");
  const problem = setupPinProblem(pin, String(form.get("confirmPin") ?? ""));
  if (problem) return { error: problem };
  if (name.length < 2 || name.length > 60) return { error: "Kasada görünecek ad 2–60 karakter olmalı." };
  if (deviceName.length < 2 || deviceName.length > 40) return { error: "Kasa adı 2–40 karakter olmalı." };
  const current = await getDevice();
  if (current && current.tenantId !== a.tenantId) return { error: "Bu tarayıcı başka işletmenin kasasına bağlı. Önce mevcut eşlemeyi yöneticinizle kaldırın." };
  const token = newDeviceToken();
  const tokenHash = await sha256(token);
  const result = await withTenant(a.tenantId, async tx => {
    const storeId = current?.storeId ?? await scopedStoreId(tx, a.tenantId, a.storeId);
    return setupRegister(tx, a.tenantId, a, { name, deviceName, pin, confirmation: String(form.get("confirmPin") ?? ""), storeId, tokenHash, current });
  });
  if ("error" in result) return { error: result.error };
  if (!current) await setDeviceCookie(token);
  revalidatePath("/yonetim/personel");
  revalidatePath("/yonetim/cihazlar");
  redirect("/kasa");
}
