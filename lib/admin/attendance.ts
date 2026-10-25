import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { canUseStore, type AccessActor } from "@/lib/core/access";
import { audit } from "@/lib/audit";
type Context = { tenantId: string; storeId: string; actor: (AccessActor & { id: string }) | {kind:"staff";id:string} };
export async function clockAttendance(ctx: Context, staffId: string, direction: string, sessionId?: string, requestId?:string) {
  const self="kind" in ctx.actor;
  if (self ? ctx.actor.id!==staffId : !canUseStore(ctx.actor as AccessActor, ctx.storeId)) throw new Error("Bu şubede işlem yetkiniz yok.");
  const actor=`${self?"staff":"user"}:${ctx.actor.id}`;
  if (!/^[0-9a-f-]{36}$/i.test(staffId) || !["in", "out"].includes(direction)) throw new Error("Personel ve işlem seçin.");
  return withTenant(ctx.tenantId, async tx => {
    const [store] = await tx.select().from(schema.stores).where(eq(schema.stores.id, ctx.storeId));
    if (!store) throw new Error("Şube bulunamadı.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([ctx.tenantId, "attendance", staffId])}))`);
    const [person] = await tx.select().from(schema.staff).where(eq(schema.staff.id, staffId));
    if (!person || (direction === "in" && !person.active)) throw new Error("Aktif personel seçin.");
    const A = schema.attendance;
    if(direction==="in"&&requestId){
      if(!/^[0-9a-f-]{36}$/i.test(requestId))throw new Error("İşlem kimliği geçersiz.");
      const[prior]=await tx.select().from(A).where(eq(A.id,requestId));
      if(prior){if(prior.staffId!==staffId||prior.storeId!==ctx.storeId)throw new Error("İşlem kimliği başka kayıtta kullanılmış.");return prior.id;}
    }
    const [open] = await tx.select().from(A).where(and(eq(A.staffId, staffId), isNull(A.endsAt)));
    if (direction === "in") {
      if (open) {
        if (open.storeId !== ctx.storeId) throw new Error("Personelin başka şubede açık girişi var.");
        return open.id;
      }
      const [row] = await tx.insert(A).values({ ...(requestId?{id:requestId}:{}),tenantId: ctx.tenantId, storeId: ctx.storeId, staffId, recordedBy: actor }).returning();
      await audit(tx, ctx.tenantId, actor, "attendance.in", { id: row.id, staffId, storeId: ctx.storeId });
      return row.id;
    }
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Güncel giriş kaydını seçin.");
    const [row] = await tx.select().from(A).where(and(eq(A.id, sessionId), eq(A.staffId, staffId), eq(A.storeId, ctx.storeId)));
    if (!row) throw new Error("Giriş kaydı bulunamadı.");
    if (row.endsAt) return row.id;
    await tx.update(A).set({ endsAt: new Date(), endedBy: actor }).where(eq(A.id, row.id));
    await audit(tx, ctx.tenantId, actor, "attendance.out", { id: row.id, staffId, storeId: ctx.storeId });
    return row.id;
  });
}
