"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { parsePlan } from "@/lib/core/staff-plan";
import { changePlanStatus, saveStaffPlan, StaffPlanError } from "./staff-plan";

export type PlanState = { error?: string; field?: string; savedAt?: number; nextId?: string };
const str = (f: FormData, key: string) => String(f.get(key) ?? "");
async function context() {
  const a = await requireWriter();
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) throw new Error("Şube bulunamadı.");
  return { tenantId: a.tenantId, storeId, actor: a };
}
export async function savePlanAction(_: PlanState, form: FormData): Promise<PlanState> {
  const ctx = await context();
  const input = parsePlan(Object.fromEntries(["id", "revision", "staffId", "kind", "title", "startsAt", "endsAt", "breakMinutes", "note"].map(k => [k, str(form, k)])), Date.now());
  if ("error" in input) return input;
  try { await saveStaffPlan(ctx, input); }
  catch (e) { return { error: e instanceof StaffPlanError ? e.message : "Plan kaydedilemedi." }; }
  revalidatePath("/yonetim/personel-plan");
  return { savedAt: Date.now(), nextId: randomUUID() };
}
export async function statusPlanAction(_: PlanState, form: FormData): Promise<PlanState> {
  const ctx = await context();
  try { await changePlanStatus(ctx, str(form, "id"), Number(str(form, "revision")), str(form, "status")); }
  catch (e) { return { error: e instanceof StaffPlanError ? e.message : "Durum kaydedilemedi." }; }
  revalidatePath("/yonetim/personel-plan");
  return { savedAt: Date.now() };
}
