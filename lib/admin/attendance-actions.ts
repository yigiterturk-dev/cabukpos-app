"use server";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { scopedStoreId } from "./store-scope";
import { clockAttendance } from "./attendance";
export async function attendanceAction(_: { error?: string; savedAt?: number }, f: FormData) {
  const actor = await requireWriter();
  const storeId = await withTenant(actor.tenantId, tx => scopedStoreId(tx, actor.tenantId, actor.storeId));
  if (!storeId) return { error: "Şube bulunamadı." };
  try { await clockAttendance({ tenantId: actor.tenantId, storeId, actor }, String(f.get("staffId")), String(f.get("direction")), String(f.get("sessionId") ?? "")); }
  catch (e) { return { error: e instanceof Error ? e.message : "İşlem kaydedilemedi." }; }
  revalidatePath("/yonetim/devam");
  return { savedAt: Date.now() };
}
