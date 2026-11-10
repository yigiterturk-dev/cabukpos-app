// lib/core/veri.ts — KVKK m.11 veri hakları: kiracının kendi verisini sayması ve hesabını silmesi.
//
// Dışa aktarma zaten app/api/yonetim/veri-export'ta. Burada yalnız:
//   - veriSayaci: silmeden önce "ne kadar veri gidiyor" göstergesi,
//   - hesabiSil: kiracıyı ve bağlı TÜM iş verisini kalıcı silme.
//
// Kiracı bir işletmenin verisinde veri işleyen, kendi hesabında veri sorumlusudur;
// silme talebini teknik olarak karşılamak bu yüzden ürünün içinde.

import "server-only";
import { count, eq } from "drizzle-orm";

import { getDb, schema, withTenant } from "@/db";

/** Silmeden önce gösterilecek kayıt sayıları. withTenant → başka kiracı sayılmaz. */
export async function veriSayaci(tenantId: string): Promise<Record<string, number>> {
  const [stores, staff, products, sales, customers, fiscalDocuments] = await withTenant(tenantId, async (tx) =>
    Promise.all([
      tx.select({ n: count() }).from(schema.stores),
      tx.select({ n: count() }).from(schema.staff),
      tx.select({ n: count() }).from(schema.products),
      tx.select({ n: count() }).from(schema.sales),
      tx.select({ n: count() }).from(schema.customers),
      tx.select({ n: count() }).from(schema.fiscalDocuments),
    ]),
  );
  const n = (r: { n: number }[]) => Number(r[0]?.n ?? 0);
  return {
    "Şube": n(stores),
    "Personel": n(staff),
    "Ürün": n(products),
    "Satış": n(sales),
    "Müşteri": n(customers),
    "e-Arşiv belgesi": n(fiscalDocuments),
  };
}

/**
 * Kiracıyı ve TÜM verisini kalıcı olarak siler. Geri alınamaz.
 *
 * tenants satırını silmek çoğu tabloyu cascade ile götürür; ancak users.store_id
 * `on delete restrict` olduğu için önce kullanıcılar silinir — aksi halde stores
 * cascade'i RESTRICT'e takılır. tenantId DAİMA oturumdan gelir.
 */
export async function hesabiSil(tenantId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.users).where(eq(schema.users.tenantId, tenantId));
    await tx.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });
}
