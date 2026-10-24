// lib/admin/store-scope.ts — #44: Panelin şube kapsamı. Seçim cz_sube çerezinde; geçersizse ilk şube.
// Şube müdürü (users.storeId dolu) için çerez yok sayılır: kapsam her zaman kendi şubesidir.
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { firstStoreId } from "./stock";

export const STORE_COOKIE = "cz_sube";

/** Aktif şube: şube müdüründe sabit; sahip/HQ'da çerezdeki seçim (geçersizse ilk şube). */
export async function scopedStoreId(tx: Tx, tenantId: string, actorStoreId: string | null): Promise<string | null> {
  if (actorStoreId) {
    const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(and(eq(schema.stores.id, actorStoreId), eq(schema.stores.tenantId, tenantId))).limit(1);
    return s?.id ?? null;
  }
  const sid = (await cookies()).get(STORE_COOKIE)?.value;
  if (sid && /^[0-9a-f-]{36}$/i.test(sid)) {
    const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(and(eq(schema.stores.id, sid), eq(schema.stores.tenantId, tenantId))).limit(1);
    if (s) return s.id;
  }
  return firstStoreId(tx);
}
