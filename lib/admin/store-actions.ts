"use server";
// #44: Şube oluşturma / düzenleme / geçiş. Geçiş çerezle olur; RLS veriyi kiracıya, kapsam çerezdeki şubeye bakar.
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { STORE_COOKIE } from "./store-scope";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;

export async function createStore(form: FormData) {
  const a = await requireWriter();
  const name = text(form, "name").slice(0, 80);
  const address = text(form, "address").slice(0, 300) || null;
  if (name.length < 2) redirect("/yonetim/subeler?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.stores).values({ tenantId: a.tenantId, name, address });
    await audit(tx, a.tenantId, `user:${a.id}`, "store.created", { name });
  });
  revalidatePath("/yonetim/subeler");
  redirect("/yonetim/subeler?ok=olusturuldu");
}

export async function updateStore(form: FormData) {
  const a = await requireWriter();
  const storeId = text(form, "storeId");
  const name = text(form, "name").slice(0, 80);
  const address = text(form, "address").slice(0, 300) || null;
  if (!UUID.test(storeId) || name.length < 2) redirect("/yonetim/subeler?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.stores).set({ name, address }).where(eq(schema.stores.id, storeId));
    await audit(tx, a.tenantId, `user:${a.id}`, "store.updated", { storeId, name });
  });
  revalidatePath("/yonetim/subeler");
  redirect("/yonetim/subeler?ok=guncellendi");
}

export async function switchStore(form: FormData) {
  const a = await requireWriter();
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
