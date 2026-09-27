// db/index.ts — Sunucu tarafı Drizzle. İş tablolarına YALNIZ withTenant içinden erişilir (RLS).
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

if (typeof window !== "undefined") throw new Error("db yalnız sunucuda");
type Db = ReturnType<typeof drizzle<typeof schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const g = globalThis as unknown as { __czDb?: Db; __czClient?: ReturnType<typeof postgres> };

export function getDb(): Db {
  if (!g.__czDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL tanımlı değil.");
    g.__czClient = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
    g.__czDb = drizzle(g.__czClient, { schema });
  }
  return g.__czDb;
}

/** İşlem içinde app.tenant_id ayarlar; RLS bu kiracının satırlarını gösterir/yazdırır. */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export async function closeDb() {
  await g.__czClient?.end();
  g.__czDb = undefined;
}
export { schema };
