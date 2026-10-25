import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { canUseStore, type AccessActor } from "@/lib/core/access";
import { audit } from "@/lib/audit";
type Context = { tenantId: string; storeId: string; actor: AccessActor & { id: string } };
export async function clockAttendance(ctx: Context, staffId: string, direction: string, sessionId?: string) {
  if (!canUseStore(ctx.actor, ctx.storeId)) throw new Error("Bu şubede işlem yetkiniz yok.");
  if (!/^[0-9a-f-]{36}$/i.test(staffId) || !["in", "out"].includes(direction)) throw new Error("Personel ve işlem seçin.");
  return withTenant(ctx.tenantId, async tx => {
    const [store] = await tx.select().from(schema.stores).where(eq(schema.stores.id, ctx.storeId));
    if (!store) throw new Error("Şube bulunamadı.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([ctx.tenantId, "attendance", staffId])}))`);
    const [person] = await tx.select().from(schema.staff).where(eq(schema.staff.id, staffId));
    if (!person || (direction === "in" && !person.active)) throw new Error("Aktif personel seçin.");
    const A = schema.attendance;
    const [open] = await tx.select().from(A).where(and(eq(A.staffId, staffId), isNull(A.endsAt)));
    if (direction === "in") {
      if (open) {
        if (open.storeId !== ctx.storeId) throw new Error("Personelin başka şubede açık girişi var.");
        return open.id;
      }
      const [row] = await tx.insert(A).values({ tenantId: ctx.tenantId, storeId: ctx.storeId, staffId, recordedBy: ctx.actor.id }).returning();
      await audit(tx, ctx.tenantId, `user:${ctx.actor.id}`, "attendance.in", { id: row.id, staffId, storeId: ctx.storeId });
      return row.id;
    }
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Güncel giriş kaydını seçin.");
    const [row] = await tx.select().from(A).where(and(eq(A.id, sessionId), eq(A.staffId, staffId), eq(A.storeId, ctx.storeId)));
    if (!row) throw new Error("Giriş kaydı bulunamadı.");
    if (row.endsAt) return row.id;
    await tx.update(A).set({ endsAt: new Date(), endedBy: ctx.actor.id }).where(eq(A.id, row.id));
    await audit(tx, ctx.tenantId, `user:${ctx.actor.id}`, "attendance.out", { id: row.id, staffId, storeId: ctx.storeId });
    return row.id;
  });
}
