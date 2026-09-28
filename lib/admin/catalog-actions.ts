"use server";
// Ürün ve kategori yönetimi. Her yazma requireAdmin + withTenant (RLS) + denetim kaydı.
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant, type Tx } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseProduct } from "./catalog";

export type CatalogState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveCategory(_: CatalogState, form: FormData): Promise<CatalogState> {
  const a = await requireAdmin();
  const name = String(form.get("categoryName") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { error: "Kategori adı 2-40 karakter.", field: "categoryName" };
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.categories).values({ tenantId: a.tenantId, name });
    await audit(tx, a.tenantId, `user:${a.id}`, "category.create", { name });
  });
  revalidatePath("/yonetim/urunler");
  return { savedAt: Date.now() };
}

export async function deleteCategory(id: string) {
  const a = await requireAdmin();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.categories).where(eq(schema.categories.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "category.delete", { id });
  });
  revalidatePath("/yonetim/urunler");
}

export async function saveProduct(id: string | null, _: CatalogState, form: FormData): Promise<CatalogState> {
  const a = await requireAdmin();
  if (id && !UUID.test(id)) return { error: "Ürün bulunamadı." };
  const f: Record<string, string> = {};
  for (const k of ["name", "price", "vatRate", "categoryId", "barcodes", "kind", "plu", "trackStock", "quick", "sellable", "unit", "cost", "minStock", "yieldMilli"]) f[k] = String(form.get(k) ?? "");
  const p = parseProduct(f);
  if (!p.ok) return { error: p.error, field: p.field };
  const P = schema.products;
  const salon = form.has("stationId"); // yalnız restoran formunda gelir
  const stationId = String(form.get("stationId") ?? "").trim() || null;
  const groupIds = [...new Set(form.getAll("optionGroups").map(String))];
  if ((stationId && !UUID.test(stationId)) || groupIds.some((g) => !UUID.test(g))) return { error: "İstasyon/seçenek geçersiz.", field: "" };
  const err = await withTenant(a.tenantId, async (tx): Promise<{ error: string; field: string } | null> => {
    if (stationId) {
      const [st] = await tx.select({ id: schema.stations.id }).from(schema.stations).where(eq(schema.stations.id, stationId));
      if (!st) return { error: "İstasyon bulunamadı.", field: "" };
    }
    if (groupIds.length && (await tx.select({ id: schema.optionGroups.id }).from(schema.optionGroups).where(inArray(schema.optionGroups.id, groupIds))).length !== groupIds.length) return { error: "Seçenek grubu bulunamadı.", field: "" };
    if (p.value.categoryId) {
      const [c] = await tx.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.id, p.value.categoryId));
      if (!c) return { error: "Kategori bulunamadı.", field: "categoryId" };
    }
    if (p.value.plu) {
      const [dup] = await tx.select({ name: P.name }).from(P).where(id ? and(eq(P.plu, p.value.plu), ne(P.id, id)) : eq(P.plu, p.value.plu));
      if (dup) return { error: `Bu PLU "${dup.name}" ürününde.`, field: "plu" };
    }
    if (id) {
      // Fiyat değişince raf etiketi kuyruğuna girer.
      const [row] = await tx.update(P).set({ ...p.value, ...(salon ? { stationId } : {}), priceChangedAt: sql`case when ${P.price} <> ${p.value.price} then now() else ${P.priceChangedAt} end`, costAt: sql`case when ${P.cost} is distinct from ${p.value.cost}::integer then now() else ${P.costAt} end` }).where(eq(P.id, id)).returning({ id: P.id });
      if (!row) return { error: "Ürün bulunamadı.", field: "" };
      if (salon) await linkGroups(tx, a.tenantId, id, groupIds);
    } else {
      const [row] = await tx.insert(schema.products).values({ tenantId: a.tenantId, ...p.value, costAt: p.value.cost === null ? null : new Date(), ...(salon ? { stationId } : {}) }).returning({ id: P.id });
      if (salon) await linkGroups(tx, a.tenantId, row.id, groupIds);
    }
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "product.update" : "product.create", { id, name: p.value.name, price: p.value.price });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/urunler");
  return { savedAt: Date.now() };
}

export async function setProductActive(id: string, active: boolean) {
  const a = await requireAdmin();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.products).set({ active: active === true }).where(and(eq(schema.products.id, id)));
    await audit(tx, a.tenantId, `user:${a.id}`, "product.active", { id, active });
  });
  revalidatePath("/yonetim/urunler");
}

/** Ürünün seçenek grupları (formdaki sırayla). */
async function linkGroups(tx: Tx, tenantId: string, productId: string, groupIds: string[]) {
  await tx.delete(schema.productOptionGroups).where(eq(schema.productOptionGroups.productId, productId));
  if (groupIds.length) await tx.insert(schema.productOptionGroups).values(groupIds.map((groupId, sort) => ({ tenantId, productId, groupId, sort })));
}
