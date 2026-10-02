// lib/admin/store-scope.ts — #44: Panelin şube kapsamı. Seçim cz_sube çerezinde; geçersizse ilk şube.
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { firstStoreId } from "./stock";

export const STORE_COOKIE = "cz_sube";

/** Çerezdeki seçili şube; yoksa ya da bu kiracıya ait değilse ilk şube. */
export async function scopedStoreId(tx: Tx, tenantId: string): Promise<string | null> {
  const sid = (await cookies()).get(STORE_COOKIE)?.value;
  if (sid && /^[0-9a-f-]{36}$/i.test(sid)) {
    const [s] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.id, sid)).limit(1);
    if (s) return s.id;
  }
  return firstStoreId(tx);
}
