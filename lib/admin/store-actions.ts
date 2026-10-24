"use server";
// #44: Şube oluşturma / düzenleme / geçiş. Geçiş çerezle olur; RLS veriyi kiracıya, kapsam çerezdeki şubeye bakar.
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { kindChangeProblem, storeKindProblem } from "@/lib/core/store";
import { parseFeeKurus, parseRoyaltyBps } from "@/lib/core/franchise";
import { STORE_COOKIE } from "./store-scope";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;
export type StoreFormState = { error?: string; field?: string };

/** Franchise koşulları: depoda yok sayılır; boş alan null (tanımsız). */
type FranchiseTermsResult = { ok: true; values: { royaltyBps: number | null; monthlyFee: number | null } } | { ok: false; state: StoreFormState };
function franchiseTerms(form: FormData, kind: string): FranchiseTermsResult {
  if (kind === "depo") return { ok: true, values: { royaltyBps: null, monthlyFee: null } };
  const bps = parseRoyaltyBps(text(form, "royalty"));
  if (bps === "invalid") return { ok: false, state: { error: "Ciro payı 0-100 arasında, en çok 2 ondalık olmalı.", field: "royalty" } };
  const fee = parseFeeKurus(text(form, "monthlyFee"));
  if (fee === "invalid") return { ok: false, state: { error: "Aylık bedel geçersiz (en fazla 1.000.000,00).", field: "monthlyFee" } };
  return { ok: true, values: { royaltyBps: bps, monthlyFee: fee } };
}

export async function createStore(_: StoreFormState, form: FormData): Promise<StoreFormState> {
  const a = await requireWriter();
  if (a.storeId) return { error: "Şube oluşturma yetkisi yalnız işletme sahibi ve zincir merkezinde.", field: "name" };
  const name = text(form, "name").slice(0, 80);
  const address = text(form, "address").slice(0, 300) || null;
  const kind = text(form, "kind") || "sube";
  if (name.length < 2) return { error: "Şube adı en az 2 karakter olmalı.", field: "name" };
  const kp = storeKindProblem(kind);
  if (kp) return { error: kp, field: "kind" };
  const terms = franchiseTerms(form, kind);
  if (!terms.ok) return terms.state;
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.stores).values({ tenantId: a.tenantId, name, address, kind: kind as "sube" | "depo", ...terms.values });
    await audit(tx, a.tenantId, `user:${a.id}`, "store.created", { name, kind, ...terms.values });
  });
  revalidatePath("/yonetim/subeler");
  revalidatePath("/yonetim", "layout");
  redirect("/yonetim/subeler?ok=olusturuldu");
}

export async function updateStore(_: StoreFormState, form: FormData): Promise<StoreFormState> {
  const a = await requireWriter();
  if (a.storeId) return { error: "Şube düzenleme yetkisi yalnız işletme sahibi ve zincir merkezinde.", field: "name" };
  const storeId = text(form, "storeId");
  const name = text(form, "name").slice(0, 80);
  const address = text(form, "address").slice(0, 300) || null;
  const kind = text(form, "kind") || "sube";
  if (!UUID.test(storeId)) return { error: "Şube bulunamadı; sayfayı yenileyip yeniden deneyin.", field: "name" };
  if (name.length < 2) return { error: "Şube adı en az 2 karakter olmalı.", field: "name" };
  const kp = storeKindProblem(kind);
  if (kp) return { error: kp, field: "kind" };
  const terms = franchiseTerms(form, kind);
  if (!terms.ok) return terms.state;
  const err = await withTenant(a.tenantId, async (tx): Promise<StoreFormState | null> => {
    const [cur] = await tx.select({ kind: schema.stores.kind }).from(schema.stores).where(eq(schema.stores.id, storeId));
    if (!cur) return { error: "Şube bulunamadı; sayfayı yenileyip yeniden deneyin.", field: "name" };
    if (cur.kind !== kind) {
      const [sales, devices, managers] = await Promise.all([
        tx.select({ n: sql<number>`count(*)::int` }).from(schema.sales).where(eq(schema.sales.storeId, storeId)),
        tx.select({ n: sql<number>`count(*)::int` }).from(schema.devices).where(and(eq(schema.devices.storeId, storeId), isNull(schema.devices.revokedAt))),
        getDb().select({ n: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.tenantId, a.tenantId), eq(schema.users.storeId, storeId), eq(schema.users.active, true))),
      ]);
      const activity = (sales[0]?.n ?? 0) > 0 || (devices[0]?.n ?? 0) > 0 || (managers[0]?.n ?? 0) > 0;
      const cp = kindChangeProblem(cur.kind, kind as "sube" | "depo", activity);
      if (cp) return { error: cp, field: "kind" };
    }
    await tx.update(schema.stores).set({ name, address, kind: kind as "sube" | "depo", ...terms.values }).where(eq(schema.stores.id, storeId));
    await audit(tx, a.tenantId, `user:${a.id}`, "store.updated", { storeId, name, kind, ...terms.values });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/subeler");
  redirect("/yonetim/subeler?ok=guncellendi");
}

export async function switchStore(form: FormData) {
  const a = await requireWriter();
  if (a.storeId) redirect("/yonetim");
  const storeId = text(form, "storeId");
  if (!UUID.test(storeId)) redirect("/yonetim/subeler?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.id, storeId)).limit(1);
    if (!s) redirect("/yonetim/subeler?hata=eksik");
  });
  (await cookies()).set(STORE_COOKIE, storeId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/yonetim", "layout");
  redirect("/yonetim/subeler?ok=gecis");
}
