"use server";
// #50 fiyat listesi / happy hour yönetimi. price_lists + price_list_items RLS'li → yine de her sorguda tenantId koşulu.
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseTL } from "@/lib/core/money";
import { scopedStoreId } from "@/lib/admin/store-scope";

export type PriceListState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** "09:30" → dakika; geçersizse null. */
const parseHM = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h > 23 || min > 59 ? null : h * 60 + min;
};

/** Form gün kutuları (d0..d6) → JS getDay dizisi; hepsi işaretliyse [] (her gün). */
const formDays = (f: FormData): number[] => [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`d${d}`) === "on");

export async function savePriceList(id: string | null, _: PriceListState, form: FormData): Promise<PriceListState> {
  const a = await requireWriter();
  const name = str(form, "name");
  if (name.length < 1 || name.length > 60) return { error: "Liste adı 1-60 karakter.", field: "name" };
  const startMin = parseHM(str(form, "start"));
  if (startMin === null) return { error: "Başlangıç saati geçersiz.", field: "start" };
  const endMin = parseHM(str(form, "end"));
  if (endMin === null) return { error: "Bitiş saati geçersiz.", field: "end" };
  if (startMin === endMin) return { error: "Başlangıç ve bitiş aynı olamaz.", field: "end" };
  if (id && !UUID.test(id)) return { error: "Liste bulunamadı." };
  const kind = str(form, "kind") === "yuzde" ? "yuzde" : "fiyat";
  const percentRaw = str(form, "percent");
  const percent = percentRaw ? Math.trunc(Number(percentRaw)) : null;
  if (kind === "yuzde" && (percent === null || !Number.isFinite(percent) || percent < 1 || percent > 100)) return { error: "İndirim yüzdesi 1-100 arası olmalı.", field: "percent" };
  const categoryIds = form.getAll("cat").map((v) => String(v)).filter((v) => UUID.test(v));
  const days = formDays(form);
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  if (!storeId) return { error: "Şube yok." };
  const vals = { name, days, startMin, endMin, kind, percent: kind === "yuzde" ? percent : null, categoryIds: kind === "yuzde" && categoryIds.length ? categoryIds : null };
  await withTenant(a.tenantId, async (tx) => {
    const L = schema.priceLists;
    if (id) await tx.update(L).set(vals).where(eq(L.id, id));
    else await tx.insert(L).values({ tenantId: a.tenantId, ...vals, sort: ((await tx.select({ n: sql<number>`count(*)` }).from(L))[0]?.n ?? 0) + 1 });
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "pricelist.update" : "pricelist.create", { id, name, kind, percent: vals.percent, categoryIds: vals.categoryIds, days, startMin, endMin });
  });
  revalidatePath("/yonetim/fiyatlistesi");
  return { savedAt: Date.now() };
}

export async function togglePriceList(id: string, active: boolean) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.priceLists).set({ active }).where(eq(schema.priceLists.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "pricelist.active", { id, active });
  });
  revalidatePath("/yonetim/fiyatlistesi");
}

export async function deletePriceList(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.priceLists).where(eq(schema.priceLists.id, id)); // kalemler cascade
    await audit(tx, a.tenantId, `user:${a.id}`, "pricelist.delete", { id });
  });
  revalidatePath("/yonetim/fiyatlistesi");
}

export async function savePriceItem(listId: string, _: PriceListState, form: FormData): Promise<PriceListState> {
  const a = await requireWriter();
  if (!UUID.test(listId)) return { error: "Liste bulunamadı." };
  const productId = str(form, "productId");
  if (!UUID.test(productId)) return { error: "Ürün seçin.", field: "productId" };
  const price = str(form, "price") === "" ? null : parseTL(str(form, "price"));
  if (price === null || price <= 0 || price > 2_147_483_647) return { error: "Fiyat 0'dan büyük ve en çok 21.474.836,47 olmalı.", field: "price" };
  const err = await withTenant(a.tenantId, async (tx) => {
    const [p] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, productId));
    if (!p) return "Ürün bulunamadı.";
    await tx.insert(schema.priceListItems).values({ tenantId: a.tenantId, listId, productId, price })
      .onConflictDoUpdate({ target: [schema.priceListItems.listId, schema.priceListItems.productId], set: { price } });
    await audit(tx, a.tenantId, `user:${a.id}`, "pricelist.item", { listId, productId, price });
    return null;
  });
  if (err) return { error: err, field: "productId" };
  revalidatePath("/yonetim/fiyatlistesi");
  return { savedAt: Date.now() };
}

export async function deletePriceItem(listId: string, id: string) {
  const a = await requireWriter();
  if (!UUID.test(listId) || !UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.priceListItems).where(and(eq(schema.priceListItems.id, id), eq(schema.priceListItems.listId, listId)));
    await audit(tx, a.tenantId, `user:${a.id}`, "pricelist.item.delete", { listId, id });
  });
  revalidatePath("/yonetim/fiyatlistesi");
}
