import { and, asc, eq, gt, gte, lt, ne, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { canUseStore, type AccessActor } from "@/lib/core/access";
import { isPlanId, isPlanStatus, planAt, planDayOffset, type PlanInput } from "@/lib/core/staff-plan";
import { isValidCalendarDay } from "@/lib/core/report";

export class StaffPlanError extends Error {}

type Context = { tenantId: string; storeId: string; actor: AccessActor & { id: string } };
const P = schema.staffPlans;
const conflict = () => new StaffPlanError("Plan başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin.");
async function scope(tx: Tx, ctx: Context) {
  if (!canUseStore(ctx.actor, ctx.storeId)) throw new StaffPlanError("Bu şubede plan yönetemezsiniz.");
  const [store] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.id, ctx.storeId)));
  if (!store) throw new StaffPlanError("Şube bulunamadı.");
}
async function lockStaff(tx: Tx, tenantId: string, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([tenantId, "staff-plan", id])}))`);
}
async function available(tx: Tx, tenantId: string, input: Pick<PlanInput, "id" | "staffId" | "kind" | "startsAt" | "endsAt">) {
  if (input.kind !== "vardiya") return;
  const [overlap] = await tx.select({ id: P.id }).from(P).where(and(eq(P.tenantId, tenantId), eq(P.staffId, input.staffId), eq(P.kind, "vardiya"), ne(P.status, "iptal"), ne(P.id, input.id), lt(P.startsAt, input.endsAt), gt(P.endsAt, input.startsAt))).limit(1);
  if (overlap) throw new StaffPlanError("Bu personelin aynı saatlerde başka bir çalışma vardiyası var. Şubeler arası çakışmayı da kontrol edin.");
}
const samePlan = (a: typeof P.$inferSelect, b: PlanInput) => a.staffId === b.staffId && a.kind === b.kind && a.title === b.title && a.note === b.note && a.breakMinutes === b.breakMinutes && a.startsAt.getTime() === b.startsAt.getTime() && a.endsAt.getTime() === b.endsAt.getTime();

/** Authenticated server actions supply the actor and resolve their selected/permitted store. */
export async function saveStaffPlan(ctx: Context, input: PlanInput) {
  return withTenant(ctx.tenantId, async tx => {
    await scope(tx, ctx);
    const own = and(eq(P.tenantId, ctx.tenantId), eq(P.storeId, ctx.storeId), eq(P.id, input.id));
    const [before] = await tx.select().from(P).where(own);
    await lockStaff(tx, ctx.tenantId, [input.staffId, ...(before ? [before.staffId] : [])]);
    const [existing] = await tx.select().from(P).where(own).for("update");
    if (input.revision === null && existing) {
      if (samePlan(existing, input)) return existing.id;
      throw conflict();
    }
    if (input.revision !== null && (!existing || existing.revision !== input.revision)) throw conflict();
    const [person] = await tx.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.tenantId, ctx.tenantId), eq(schema.staff.id, input.staffId), eq(schema.staff.active, true)));
    if (!person) throw new StaffPlanError("Aktif personel seçin.");
    if (!existing || existing.status !== "iptal") await available(tx, ctx.tenantId, input);
    const values = { staffId: input.staffId, kind: input.kind, title: input.title, startsAt: input.startsAt, endsAt: input.endsAt, breakMinutes: input.breakMinutes, note: input.note };
    if (existing) {
      const [saved] = await tx.update(P).set({ ...values, revision: existing.revision + 1, updatedAt: new Date() }).where(and(own, eq(P.revision, input.revision!))).returning({ id: P.id });
      if (!saved) throw conflict();
    } else {
      const [saved] = await tx.insert(P).values({ id: input.id, tenantId: ctx.tenantId, storeId: ctx.storeId, createdBy: ctx.actor.id, ...values }).onConflictDoNothing({ target: P.id }).returning({ id: P.id });
      if (!saved) throw conflict();
    }
    await audit(tx, ctx.tenantId, `user:${ctx.actor.id}`, existing ? "staff.plan.update" : "staff.plan.create", { id: input.id, storeId: ctx.storeId, ...values });
    return input.id;
  });
}

export async function changePlanStatus(ctx: Context, id: string, revision: number, status: string) {
  if (!isPlanId(id) || !Number.isSafeInteger(revision) || revision < 1 || !isPlanStatus(status)) throw new StaffPlanError("Geçersiz plan durumu.");
  return withTenant(ctx.tenantId, async tx => {
    await scope(tx, ctx);
    const own = and(eq(P.tenantId, ctx.tenantId), eq(P.storeId, ctx.storeId), eq(P.id, id));
    const [before] = await tx.select().from(P).where(own);
    if (!before) throw new StaffPlanError("Plan bulunamadı.");
    await lockStaff(tx, ctx.tenantId, [before.staffId]);
    const [current] = await tx.select().from(P).where(own).for("update");
    if (!current || current.revision !== revision) throw conflict();
    if (current.status === status) return;
    if (status !== "iptal") {
      if (status !== "tamamlandi") {
        const [staff] = await tx.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.id, current.staffId), eq(schema.staff.tenantId, ctx.tenantId), eq(schema.staff.active, true)));
        if (!staff) throw new StaffPlanError("Pasif personele plan başlatılamaz.");
      }
      await available(tx, ctx.tenantId, { ...current, kind: current.kind as PlanInput["kind"] });
    }
    const [saved] = await tx.update(P).set({ status, revision: current.revision + 1, updatedAt: new Date() }).where(and(own, eq(P.revision, revision))).returning({ id: P.id });
    if (!saved) throw conflict();
    await audit(tx, ctx.tenantId, `user:${ctx.actor.id}`, "staff.plan.status", { id, storeId: ctx.storeId, before: current.status, status });
  });
}

export async function listStaffPlans(ctx: Context, day: string) {
  if (!isValidCalendarDay(day)) throw new StaffPlanError("Geçersiz gün.");
  return withTenant(ctx.tenantId, async tx => {
    await scope(tx, ctx);
    const staff = await tx.select({ id: schema.staff.id, name: schema.staff.name, active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.tenantId, ctx.tenantId)).orderBy(asc(schema.staff.name));
    const rows = await tx.select().from(P).where(and(eq(P.tenantId, ctx.tenantId), eq(P.storeId, ctx.storeId), gte(P.startsAt, planAt(`${day}T00:00`)! ), lt(P.startsAt, planAt(`${planDayOffset(day, 7)}T00:00`)!))).orderBy(asc(P.startsAt), asc(P.id)).limit(1001);
    if (rows.length > 1000) throw new StaffPlanError("Bu haftada 1000 plan sınırı aşıldı. Gün aralığını daraltın.");
    return { rows, staff };
  });
}
