// lib/integrations/keys.ts — M9c ajans erişim anahtarları. integration_keys RLS dışı → her sorguda tenantId koşulu.
// Düz anahtar yalnız üretimde döner; DB'de sha256.
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { newDeviceToken, sha256 } from "@/lib/auth/tokens";

const K = schema.integrationKeys;
export const KEY_PREFIX = "cpk_";

export type IntegrationScope = "stats" | "growth";

export async function createKey(tenantId: string, name: string, scope: IntegrationScope = "stats"): Promise<{ id: string; key: string }> {
  const key = KEY_PREFIX + newDeviceToken();
  const [row] = await getDb().insert(K).values({ tenantId, name, scope, prefix: key.slice(0, 8), keyHash: await sha256(key) }).returning({ id: K.id });
  return { id: row.id, key };
}

export function listKeys(tenantId: string) {
  return getDb().select({ id: K.id, name: K.name, scope: K.scope, prefix: K.prefix, createdAt: K.createdAt, lastUsedAt: K.lastUsedAt, revokedAt: K.revokedAt })
    .from(K).where(eq(K.tenantId, tenantId)).orderBy(desc(K.createdAt));
}

export async function revokeKey(tenantId: string, id: string): Promise<boolean> {
  const rows = await getDb().update(K).set({ revokedAt: new Date() })
    .where(and(eq(K.id, id), eq(K.tenantId, tenantId), isNull(K.revokedAt))).returning({ id: K.id });
  return rows.length > 0;
}

/** Etkin anahtar → kiracı. Son kullanım en fazla dakikada bir yazılır. */
export async function findKey(key: string): Promise<{ id: string; tenantId: string; tenantName: string; scope: string } | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const [row] = await getDb().select({ id: K.id, tenantId: K.tenantId, tenantName: schema.tenants.name, scope: K.scope })
    .from(K).innerJoin(schema.tenants, eq(schema.tenants.id, K.tenantId))
    .where(and(eq(K.keyHash, await sha256(key)), isNull(K.revokedAt)));
  if (!row) return null;
  await getDb().update(K).set({ lastUsedAt: new Date() })
    .where(and(eq(K.id, row.id), or(isNull(K.lastUsedAt), lt(K.lastUsedAt, sql`now() - interval '1 minute'`))));
  return row;
}

export function keyFromRequest(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? findKey(m[1]) : Promise.resolve(null);
}
