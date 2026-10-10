// lib/call.ts — Garson çağrısı: QR menü (?k= sırrı) masa seçer, kayıt masa başına tektir;
// kasa/garson tabletindeki salon panosu açık çağrıları görür, "Geldim" ile kapatır.
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { kioskConn } from "@/lib/kiosk";

export type CallRow = { id: string; tableId: string; table: string; note: string | null; createdAt: Date };

export type CallOutcome = { ok: true } | { ok: false; reason: string };

/** QR menüden çağrı: kiosko sırrı doğrulanır; masa mağazaya bağlı ve aktif olmalı. */
export async function callWaiter(storeId: string, secret: string, tableId: string, note: string | null): Promise<CallOutcome> {
  const conn = await kioskConn(storeId, secret);
  if (!conn) return { ok: false, reason: "Kiosko kapalı." };
  if (!/^[0-9a-f-]{36}$/i.test(tableId)) return { ok: false, reason: "Masa geçersiz." };
  return withTenant(conn.tenantId, async (tx) => {
    // Masa şubeye area üstünden bağlıdır (tables.store_id yoktur).
    const [t] = await tx.select({ id: schema.tables.id }).from(schema.tables)
      .innerJoin(schema.areas, eq(schema.areas.id, schema.tables.areaId))
      .where(and(eq(schema.tables.id, tableId), eq(schema.areas.storeId, conn.storeId), eq(schema.tables.active, true)));
    if (!t) return { ok: false, reason: "Masa bulunamadı." };
    await tx.insert(schema.tableCalls).values({ tenantId: conn.tenantId, storeId: conn.storeId, tableId, note }).onConflictDoNothing();
    return { ok: true as const };
  });
}

/** Açık çağrılar (kasa panosu). FORCE RLS → kiracı bağlamı şart. */
export async function openCalls(tenantId: string, storeId: string): Promise<CallRow[]> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return [];
  const C = schema.tableCalls, T = schema.tables, A = schema.areas;
  return withTenant(tenantId, (tx) => tx.select({
    id: C.id, tableId: C.tableId, table: sql<string>`${A.name} || ' · ' || ${T.name}`, note: C.note, createdAt: C.createdAt,
  }).from(C).innerJoin(T, eq(T.id, C.tableId)).innerJoin(A, eq(A.id, T.areaId))
    .where(and(eq(C.storeId, storeId), isNull(C.resolvedAt))).orderBy(C.createdAt).limit(30));
}

/** "Geldim": çağrıyı kapatır; kimlik audit/amacıyla cihaz etiketi olarak yazılır. */
export async function resolveCall(tenantId: string, storeId: string, id: string, by: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return withTenant(tenantId, async (tx) => {
    const r = await tx.update(schema.tableCalls).set({ resolvedAt: new Date(), resolvedBy: by })
      .where(and(eq(schema.tableCalls.id, id), eq(schema.tableCalls.storeId, storeId), isNull(schema.tableCalls.resolvedAt))).returning({ id: schema.tableCalls.id });
    return r.length > 0;
  });
}

/** getDb okuma: RLS'siz akışta yalnız sayım (test/teşhis). */
export async function callCount(tenantId: string, storeId: string): Promise<number> {
  const rows = await withTenant(tenantId, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(schema.tableCalls).where(and(eq(schema.tableCalls.storeId, storeId), isNull(schema.tableCalls.resolvedAt))));
  return rows[0]?.n ?? 0;
}
