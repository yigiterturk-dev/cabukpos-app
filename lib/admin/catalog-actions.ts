"use server";
// Ürün ve kategori yönetimi. Her yazma requireWriter + withTenant (RLS) + denetim kaydı.
import { and, arrayOverlaps, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant, type Tx } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { parseProduct, type ProductValue } from "./catalog";
import { parseProductCsv, type ProductCsvRow } from "@/lib/core/product-csv";

export type CatalogState = { error?: string; field?: string; savedAt?: number };
export type ProductImportState = { error?: string; imported?: number; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;

const yes = (v: string) => /^(1|true|evet|e|yes)$/iu.test(v.trim()) ? "true" : /^(0|false|hayır|hayir|h|no)$/iu.test(v.trim()) ? "false" : v;
const kind = (v: string) => /^(tartılı|tartili|kg|ağırlık|agirlik)$/iu.test(v.trim()) ? "tartili" : v;
const unit = (v: string) => /^(litre|liter|l)$/iu.test(v.trim()) ? "lt" : v;
const categoryKey = (v: string) => v.trim().toLocaleLowerCase("tr-TR");

function productFields(row: ProductCsvRow, categoryId: string | null) {
  return {
    name: row.name, price: row.price, vatRate: row.vatRate || "10", categoryId: categoryId ?? "",
    barcodes: row.barcodes, kind: kind(row.kind || "adet"), plu: row.plu, trackStock: yes(row.trackStock),
    quick: yes(row.quick), sellable: yes(row.sellable || "true"), unit: unit(row.unit || "adet"),
    cost: row.cost, minStock: row.minStock, yieldMilli: row.yieldMilli,
  };
}

export async function saveCategory(_: CatalogState, form: FormData): Promise<CatalogState> {
  const a = await requireWriter();
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
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.categories).where(eq(schema.categories.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "category.delete", { id });
  });
  revalidatePath("/yonetim/urunler");
}

export async function saveProduct(id: string | null, _: CatalogState, form: FormData): Promise<CatalogState> {
  const a = await requireWriter();
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
    const storeId = salon ? await scopedStoreId(tx, a.tenantId) : null;
    if (salon && stationId && !storeId) return { error: "İstasyon atamak için önce bir şube seçin.", field: "" };
    if (stationId) {
      const [st] = await tx.select({ id: schema.stations.id }).from(schema.stations).where(and(eq(schema.stations.id, stationId), storeId ? eq(schema.stations.storeId, storeId) : sql`false`));
      if (!st) return { error: "İstasyon bulunamadı.", field: "" };
    }
    if (groupIds.length && (await tx.select({ id: schema.optionGroups.id }).from(schema.optionGroups).where(inArray(schema.optionGroups.id, groupIds))).length !== groupIds.length) return { error: "Seçenek grubu bulunamadı.", field: "" };
    if (p.value.categoryId) {
      const [c] = await tx.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.id, p.value.categoryId));
      if (!c) return { error: "Kategori bulunamadı.", field: "categoryId" };
    }
    const current = id
      ? (await tx.select({ id: P.id, barcodes: P.barcodes, kind: P.kind, sellable: P.sellable, unit: P.unit }).from(P).where(eq(P.id, id)).limit(1))[0]
      : null;
    if (id && !current) return { error: "Ürün bulunamadı.", field: "" };
    if (current) {
      const previousStockUnit = current.sellable ? current.kind === "tartili" ? "kg" : "adet" : current.unit;
      const nextStockUnit = p.value.sellable ? p.value.kind === "tartili" ? "kg" : "adet" : p.value.unit;
      if (previousStockUnit !== nextStockUnit) {
        const [movement, countLine, recipeUse, saleLine, purchaseLine, production] = await Promise.all([
          tx.select({ id: schema.stockMovements.id }).from(schema.stockMovements).where(eq(schema.stockMovements.productId, current.id)).limit(1),
          tx.select({ id: schema.stockCountLines.id }).from(schema.stockCountLines).where(eq(schema.stockCountLines.productId, current.id)).limit(1),
          tx.select({ id: schema.recipeItems.id }).from(schema.recipeItems).where(eq(schema.recipeItems.ingredientId, current.id)).limit(1),
          tx.select({ id: schema.saleLines.id }).from(schema.saleLines).where(eq(schema.saleLines.productId, current.id)).limit(1),
          tx.select({ id: schema.purchaseLines.id }).from(schema.purchaseLines).where(eq(schema.purchaseLines.productId, current.id)).limit(1),
          tx.select({ id: schema.productions.id }).from(schema.productions).where(eq(schema.productions.productId, current.id)).limit(1),
        ]);
        if (movement.length || countLine.length || recipeUse.length || saleLine.length || purchaseLine.length || production.length) {
          return { error: "Bu ürünün satış, sayım, stok veya reçete geçmişi var. Birim değiştirmek geçmiş miktarları yanlış yorumlatır; yeni birim için ayrı ürün oluşturun.", field: "" };
        }
        if (!form.has("unitValuesReviewed")) {
          return { error: "Maliyet, kritik stok sınırı ve parti miktarını yeni birime göre kontrol edip onaylayın.", field: "" };
        }
      }
    }
    const addedBarcodes = p.value.barcodes.filter((barcode) => !current?.barcodes.includes(barcode));
    if (addedBarcodes.length) {
      const [duplicate] = await tx.select({ name: P.name, barcodes: P.barcodes }).from(P)
        .where(and(arrayOverlaps(P.barcodes, addedBarcodes), id ? ne(P.id, id) : undefined)).limit(1);
      if (duplicate) {
        const barcode = duplicate.barcodes.find((value) => addedBarcodes.includes(value));
        return { error: `Barkod ${barcode ?? ""} zaten "${duplicate.name}" ürününde.`, field: "barcodes" };
      }
    }
    if (p.value.plu) {
      const [dup] = await tx.select({ name: P.name }).from(P).where(id ? and(eq(P.plu, p.value.plu), ne(P.id, id)) : eq(P.plu, p.value.plu));
      if (dup) return { error: `Bu PLU "${dup.name}" ürününde.`, field: "plu" };
    }
    let productId = id;
    if (id) {
      // Fiyat değişince raf etiketi kuyruğuna girer.
      const [row] = await tx.update(P).set({ ...p.value, priceChangedAt: sql`case when ${P.price} <> ${p.value.price} then now() else ${P.priceChangedAt} end`, costAt: sql`case when ${P.cost} is distinct from ${p.value.cost}::integer then now() else ${P.costAt} end` }).where(eq(P.id, id)).returning({ id: P.id });
      if (!row) return { error: "Ürün bulunamadı.", field: "" };
      if (salon) await linkGroups(tx, a.tenantId, id, groupIds);
    } else {
      const [row] = await tx.insert(schema.products).values({ tenantId: a.tenantId, ...p.value, costAt: p.value.cost === null ? null : new Date() }).returning({ id: P.id });
      productId = row.id;
      if (salon) await linkGroups(tx, a.tenantId, row.id, groupIds);
    }
    if (salon && storeId && productId) {
      const R = schema.productStationRoutes;
      await tx.insert(R).values({ tenantId: a.tenantId, storeId, productId, stationId })
        .onConflictDoUpdate({ target: [R.storeId, R.productId], set: { stationId } });
    }
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "product.update" : "product.create", { id, name: p.value.name, price: p.value.price });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/urunler");
  return { savedAt: Date.now() };
}

export async function importProducts(_: ProductImportState, form: FormData): Promise<ProductImportState> {
  const a = await requireWriter();
  const upload = form.get("file");
  if (!upload || typeof upload !== "object" || !("text" in upload) || typeof upload.text !== "function") return { error: "Bir CSV dosyası seçin." };
  if (!("size" in upload) || typeof upload.size !== "number" || upload.size > 1_000_000) return { error: "CSV dosyası en fazla 1 MB olabilir." };
  const text = await (upload as { text: () => Promise<string> }).text();
  if (text.length > 1_000_000) return { error: "CSV dosyası en fazla 1 MB olabilir." };
  const parsed = parseProductCsv(text);
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.rows.length > 500) return { error: "Tek seferde en fazla 500 ürün aktarılabilir." };

  const prepared = parsed.rows.map((row) => ({ row, parsed: parseProduct(productFields(row, null)) }));
  const invalid = prepared.find((x) => !x.parsed.ok);
  if (invalid && !invalid.parsed.ok) return { error: `Satır ${invalid.row.line}: ${invalid.parsed.error}` };
  const valid = prepared.filter((x): x is { row: ProductCsvRow; parsed: { ok: true; value: ProductValue } } => x.parsed.ok);
  const plUs = valid.map((x) => x.parsed.value.plu).filter((v): v is string => !!v);
  if (new Set(plUs).size !== plUs.length) return { error: "CSV içinde aynı PLU birden fazla kez kullanılmış." };
  const barcodes = valid.flatMap((x) => x.parsed.value.barcodes);
  if (new Set(barcodes).size !== barcodes.length) return { error: "CSV içinde aynı barkod birden fazla kez kullanılmış." };

  const result = await withTenant(a.tenantId, async (tx) => {
    const P = schema.products;
    if (plUs.length) {
      const existing = await tx.select({ name: P.name, plu: P.plu }).from(P).where(inArray(P.plu, plUs));
      if (existing.length) throw new Error(`PLU zaten kullanımda: ${existing[0].plu} (${existing[0].name}).`);
    }
    const importedBarcodes = new Set(barcodes);
    if (importedBarcodes.size) {
      const existing = await tx.select({ name: P.name, barcodes: P.barcodes }).from(P);
      const duplicate = existing.find((p) => p.barcodes.some((barcode) => importedBarcodes.has(barcode)));
      if (duplicate) throw new Error(`Barkod zaten kullanımda: ${duplicate.name}.`);
    }
    const categories = await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories);
    const byName = new Map(categories.map((c) => [categoryKey(c.name), c.id]));
    for (const item of valid) {
      const categoryName = item.row.category.trim();
      if (categoryName && (categoryName.length < 2 || categoryName.length > 40)) throw new Error(`Satır ${item.row.line}: kategori adı 2-40 karakter olmalı.`);
      if (categoryName && !byName.has(categoryKey(categoryName))) {
        const [created] = await tx.insert(schema.categories).values({ tenantId: a.tenantId, name: categoryName }).returning({ id: schema.categories.id });
        byName.set(categoryKey(categoryName), created.id);
      }
    }
    const values = valid.map(({ row, parsed: p }) => ({
      tenantId: a.tenantId,
      ...p.value,
      categoryId: row.category.trim() ? byName.get(categoryKey(row.category)) ?? null : null,
      costAt: p.value.cost === null ? null : new Date(),
    }));
    await tx.insert(P).values(values);
    await audit(tx, a.tenantId, `user:${a.id}`, "product.import", { count: values.length, source: "csv" });
  }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Ürün aktarımı başarısız." }));
  if (result?.error) return result;
  revalidatePath("/yonetim/urunler");
  return { imported: valid.length, savedAt: Date.now() };
}

export async function setProductActive(id: string, active: boolean) {
  const a = await requireWriter();
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
