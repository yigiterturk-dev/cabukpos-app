"use server";
// Ürün ve kategori yönetimi. Her yazma requireAdmin + withTenant (RLS) + denetim kaydı.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
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
  for (const k of ["name", "price", "vatRate", "categoryId", "barcodes"]) f[k] = String(form.get(k) ?? "");
  const p = parseProduct(f);
  if (!p.ok) return { error: p.error, field: p.field };
  const err = await withTenant(a.tenantId, async (tx) => {
    if (p.value.categoryId) {
      const [c] = await tx.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.id, p.value.categoryId));
      if (!c) return "Kategori bulunamadı.";
    }
    if (id) {
      const [row] = await tx.update(schema.products).set(p.value).where(eq(schema.products.id, id)).returning({ id: schema.products.id });
      if (!row) return "Ürün bulunamadı.";
    } else {
      await tx.insert(schema.products).values({ tenantId: a.tenantId, ...p.value });
    }
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "product.update" : "product.create", { id, name: p.value.name, price: p.value.price });
    return null;
  });
  if (err) return { error: err, field: "categoryId" };
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
