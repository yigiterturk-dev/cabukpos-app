"use server";
// Bulut mutfak yönetimi: marka CRUD + menü seçkisi. slug QR adresinde taşınır.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { requireWriter } from "@/lib/auth/session";
import { isBrandSlug, slugify } from "@/lib/brands";
import { scopedStoreId } from "@/lib/admin/store-scope";

export type BrandState = { error?: string; field?: string; savedAt?: number; info?: string };
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createBrand(_: BrandState, f: FormData): Promise<BrandState> {
  const a = await requireWriter();
  const name = str(f, "name");
  const slug = str(f, "slug") || slugify(name);
  if (name.length < 1 || name.length > 80) return { error: "Marka adı 1–80 karakter olmalı.", field: "name" };
  if (!isBrandSlug(slug)) return { error: "Adres 2–40 karakter: küçük harf, rakam, tire.", field: "slug" };
  try {
    const id = await withTenant(a.tenantId, async (tx) => {
      const storeId = await scopedStoreId(tx, a.tenantId);
      if (!storeId) throw new Error("Şube yok.");
      const [b] = await tx.insert(schema.brands).values({ tenantId: a.tenantId, storeId, name, slug }).returning();
      await audit(tx, a.tenantId, `user:${a.id}`, "brand.create", { id: b.id, name, slug });
      return b.id;
    });
    void id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { error: msg.includes("brands_slug_uq") ? "Bu adres kullanılıyor." : msg || "Kaydedilemedi.", field: msg.includes("brands_slug_uq") ? "slug" : undefined };
  }
  revalidatePath("/yonetim/markalar");
  return { savedAt: Date.now(), info: "Marka eklendi." };
}

export async function saveBrand(id: string, _: BrandState, f: FormData): Promise<BrandState> {
  const a = await requireWriter();
  if (!UUID.test(id)) return { error: "Marka bulunamadı." };
  const name = str(f, "name");
  const slug = str(f, "slug") || slugify(name);
  if (name.length < 1 || name.length > 80) return { error: "Marka adı 1–80 karakter olmalı.", field: "name" };
  if (!isBrandSlug(slug)) return { error: "Adres 2–40 karakter: küçük harf, rakam, tire.", field: "slug" };
  try {
    await withTenant(a.tenantId, async (tx) => {
      await tx.update(schema.brands).set({ name, slug }).where(and(eq(schema.brands.id, id), eq(schema.brands.tenantId, a.tenantId)));
      await audit(tx, a.tenantId, `user:${a.id}`, "brand.update", { id, name, slug });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { error: msg.includes("brands_slug_uq") ? "Bu adres kullanılıyor." : msg || "Kaydedilemedi.", field: msg.includes("brands_slug_uq") ? "slug" : undefined };
  }
  revalidatePath("/yonetim/markalar");
  return { savedAt: Date.now(), info: "Kaydedildi." };
}

export async function toggleBrand(id: string, active: boolean) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.brands).set({ active }).where(and(eq(schema.brands.id, id), eq(schema.brands.tenantId, a.tenantId)));
    await audit(tx, a.tenantId, `user:${a.id}`, "brand.toggle", { id, active });
  });
  revalidatePath("/yonetim/markalar");
}

/** Menü seçkisi: gönderilen ürün kimlikleriyle değiştirilir (idempotent tam senkron). */
export async function setBrandProducts(brandId: string, _: BrandState, f: FormData): Promise<BrandState> {
  const a = await requireWriter();
  if (!UUID.test(brandId)) return { error: "Marka bulunamadı." };
  const ids = [...new Set(f.getAll("product").map((v) => String(v)).filter((v) => UUID.test(v)))];
  try {
    await withTenant(a.tenantId, async (tx) => {
      const [b] = await tx.select({ id: schema.brands.id }).from(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.tenantId, a.tenantId)));
      if (!b) throw new Error("Marka bulunamadı.");
      await tx.delete(schema.brandProducts).where(eq(schema.brandProducts.brandId, brandId));
      if (ids.length) await tx.insert(schema.brandProducts).values(ids.map((productId) => ({ brandId, productId })));
      await audit(tx, a.tenantId, `user:${a.id}`, "brand.products", { brandId, count: ids.length });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kaydedilemedi." };
  }
  revalidatePath("/yonetim/markalar");
  return { savedAt: Date.now(), info: `Menü güncellendi (${ids.length} ürün).` };
}
