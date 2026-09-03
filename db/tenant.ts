// Tenant-scoped DB erişimi — RLS ile birlikte çalışır.
//
// NEDEN (kritik): Neon HTTP driver stateless'tir. İki sonuç doğurur:
//   1) `SET app.business_id = ...` bir sonraki ayrı sorguya TAŞINMAZ.
//   2) Drizzle'ın `db.transaction(async tx => ...)` callback formu neon-http'de
//      DESTEKLENMEZ ("No transactions support in neon-http driver").
// RLS politikası (db/rls.sql) ise `current_setting('app.business_id', true)` okur,
// yani ayar ile asıl sorgu AYNI bağlantıda/işlemde olmalı.
//
// ÇÖZÜM: Neon raw client'ın `client.transaction([...])` (dizi) formu, tüm ifadeleri
// TEK HTTP isteğinde, TEK bağlantıda ve tek transaction içinde çalıştırır. İlk ifade
// `SET LOCAL app.business_id = '<uuid>'`, ardından gerçek sorgular gelir → RLS doğru
// tenant'ı görür. Sorguları Drizzle ile tip-güvenli kurar, `.toSQL()` ile {sql,params}
// çıkarıp bu batch'e besleriz.
//
// SET LOCAL parametre bind kabul etmez ($1 yasak) → businessId'yi literal gömeriz;
// bu yüzden ÖNCE katı uuid doğrulaması yapılır (SQL-injection'a kapı bırakma).
//
// KRİTİK — BYPASSRLS: Neon bağlantı rolü `neondb_owner`, `rolbypassrls=true` taşır;
// bu rol RLS'i (FORCE dahil) atlar. Bu yüzden transaction içinde ÖNCE
// `SET LOCAL ROLE app_tenant` ile NOBYPASSRLS rolüne geçeriz (bkz. db/tenant-role.sql).
// Bu role geçilmediği sürece RLS gerçekten enforce OLMAZ. Rol henüz uygulanmadıysa
// `SET LOCAL ROLE` hata verir → withTenant fail-closed davranır (sorgu çalışmaz),
// böylece "RLS sanılan ama yok" sessiz açığı oluşmaz.
//
// App-katmanı sorgularına DAİMA `eq(table.businessId, businessId)` filtresi de
// eklenmeli (RLS backstop; tek savunma hattına güvenme).

// Tenant sorgularının çalışacağı NOBYPASSRLS rolü (db/tenant-role.sql ile oluşturulur).
const TENANT_ROLE = "app_tenant";

import { neon } from "@neondatabase/serverless";

// Drizzle query builder'ların ortak yüzeyi: .toSQL() → { sql, params }
export type SqlPreparable = { toSQL: () => { sql: string; params: unknown[] } };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL tanımlı değil (.env.local).");
  }
  return neon(process.env.DATABASE_URL);
}

/**
 * Verilen businessId için tenant-scope'lu bir batch çalıştırır.
 * `build` fonksiyonu, Drizzle query builder'lardan oluşan bir dizi döndürür
 * (her biri `.toSQL()` destekler — `db.select()...`, `db.insert()...` vb.).
 * Tüm sorgular, başına `SET LOCAL app.business_id` eklenmiş tek bir transaction'da
 * çalışır; RLS doğru tenant'ı uygular. Dönüş: her sorgunun satır dizisi (girdi sırasıyla).
 *
 * @example
 *   const [rows] = await withTenant(businessId, (q) => [
 *     q.select().from(schema.services).where(eq(schema.services.businessId, businessId)),
 *   ]);
 */
export async function withTenant<T extends readonly SqlPreparable[]>(
  businessId: string,
  build: () => [...T]
): Promise<{ [K in keyof T]: Record<string, unknown>[] }> {
  if (!UUID_RE.test(businessId)) {
    throw new Error("withTenant: geçersiz businessId (uuid bekleniyor).");
  }

  const client = getClient();
  const builders = build();

  const queries = [
    // 1) NOBYPASSRLS rolüne geç (RLS'in gerçekten uygulanması için — bkz. yorum).
    client.query(`SET LOCAL ROLE ${TENANT_ROLE}`),
    // 2) Tenant'ı set et. SET LOCAL bind kabul etmez → doğrulanmış uuid literal gömülür.
    client.query(`SET LOCAL app.business_id = '${businessId}'`),
    ...builders.map((b) => {
      const { sql, params } = b.toSQL();
      return client.query(sql, params as unknown[]);
    }),
  ];

  const results = (await client.transaction(queries)) as unknown[];
  // İlk iki eleman SET LOCAL ROLE + SET LOCAL sonuçları — at, kalanları döndür.
  return results.slice(2) as { [K in keyof T]: Record<string, unknown>[] };
}
