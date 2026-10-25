import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq, and } = await import("drizzle-orm");
const { saveStaffPlan, changePlanStatus, listStaffPlans } = await import("@/lib/admin/staff-plan");
const { planAt } = await import("@/lib/core/staff-plan");
const [tenant] = await getDb().insert(schema.tenants).values({ name: "Plan test", vertical: "restoran" }).returning();
const [other] = await getDb().insert(schema.tenants).values({ name: "Plan other", vertical: "restoran" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, other.id));
  await closeDb();
});
const f = await withTenant(tenant.id, async tx => {
  const stores = await tx.insert(schema.stores).values([{ tenantId: tenant.id, name: "Merkez" }, { tenantId: tenant.id, name: "Şube" }]).returning();
  const staff = await tx.insert(schema.staff).values([{ tenantId: tenant.id, name: "Ali", pinHash: "!" }, { tenantId: tenant.id, name: "Ayşe", pinHash: "!" }, { tenantId: tenant.id, name: "Pasif", pinHash: "!", active: false }]).returning();
  const [user] = await tx.insert(schema.users).values({ tenantId: tenant.id, email: `plan-${tenant.id}@test.local`, name: "Owner", passwordHash: "!", role: "sahip" }).returning();
  return { stores, staff, user };
});
const ctx = { tenantId: tenant.id, storeId: f.stores[0].id, actor: { id: f.user.id, role: "sahip" as const, storeId: null } };
const input = (day: string, start = "09:00", end = "17:00") => ({ id: crypto.randomUUID(), revision: null as number | null, staffId: f.staff[0].id, kind: "vardiya" as const, title: "Çalışma", startsAt: planAt(`2026-10-${day}T${start}`)!, endsAt: planAt(`2026-10-${day}T${end}`)!, breakMinutes: 30, note: "" });
const row = (id: string) => withTenant(tenant.id, async tx => (await tx.select().from(schema.staffPlans).where(eq(schema.staffPlans.id, id)))[0]);

test("çakışma şubeler arasında da engellenir; bitişik vardiya ve görev kabul edilir", async () => {
  const a = input("26"); await saveStaffPlan(ctx, a);
  assert.equal(await saveStaffPlan(ctx, a), a.id, "aynı oluşturma isteği çoğalmaz");
  await assert.rejects(saveStaffPlan(ctx, input("26", "16:00", "20:00")), /aynı saatlerde/);
  await assert.rejects(saveStaffPlan({ ...ctx, storeId: f.stores[1].id }, input("26")), /aynı saatlerde/);
  await saveStaffPlan(ctx, input("26", "17:00", "22:00"));
  await saveStaffPlan(ctx, { ...input("26", "10:00", "11:00"), kind: "gorev", breakMinutes: 0 });
  const audit = await withTenant(tenant.id, tx => tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.plan.create")));
  assert.equal(audit.length, 3);
});

test("aynı saatlere eşzamanlı iki vardiyadan yalnız biri yazılır", async () => {
  const results = await Promise.allSettled([saveStaffPlan(ctx, input("27")), saveStaffPlan(ctx, input("27"))]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
});

test("iptal zaman aralığını açar; eski vardiya çakışırken yeniden açılamaz", async () => {
  const a = input("28"); await saveStaffPlan(ctx, a);
  await changePlanStatus(ctx, a.id, 1, "iptal");
  await saveStaffPlan(ctx, input("28"));
  await assert.rejects(changePlanStatus(ctx, a.id, 2, "planlandi"), /aynı saatlerde/);
  assert.equal((await row(a.id)).status, "iptal");
});

test("eski sürümle düzenleme/durum değişimi yeni kaydı ezmez; görev tamamlanır", async () => {
  const a = { ...input("29"), kind: "gorev" as const, breakMinutes: 0 }; await saveStaffPlan(ctx, a);
  await saveStaffPlan(ctx, { ...a, revision: 1, title: "Düzenlenen görev" });
  await assert.rejects(changePlanStatus(ctx, a.id, 1, "tamamlandi"), /başka bir işlemle/);
  await changePlanStatus(ctx, a.id, 2, "suruyor");
  await changePlanStatus(ctx, a.id, 3, "tamamlandi");
  assert.equal((await row(a.id)).title, "Düzenlenen görev");
  assert.equal((await row(a.id)).status, "tamamlandi");
});

test("şube müdürü başka şubenin planını değiştiremez; pasif/başka kiracı personeli atanamaz", async () => {
  const manager = { ...ctx, actor: { ...ctx.actor, role: "mudur" as const, storeId: ctx.storeId } };
  await assert.rejects(saveStaffPlan({ ...manager, storeId: f.stores[1].id }, input("30")), /Bu şubede/);
  await assert.rejects(saveStaffPlan(ctx, { ...input("30"), staffId: f.staff[2].id }), /Aktif personel/);
  const [outsider] = await withTenant(other.id, tx => tx.insert(schema.staff).values({ tenantId: other.id, name: "Yabancı", pinHash: "!" }).returning());
  await assert.rejects(saveStaffPlan(ctx, { ...input("30"), staffId: outsider.id }), /Aktif personel/);
  const a = input("30"); await saveStaffPlan(ctx, a);
  const hidden = await withTenant(other.id, tx => tx.select().from(schema.staffPlans).where(eq(schema.staffPlans.id, a.id)));
  assert.equal(hidden.length, 0);
  await assert.rejects(withTenant(other.id, tx => tx.insert(schema.staffPlans).values({ ...a, revision: 1, id: crypto.randomUUID(), tenantId: tenant.id, storeId: ctx.storeId })), /./, "RLS başka kiracıya doğrudan yazımı engeller");
  assert.equal((await listStaffPlans(manager, "2026-10-26")).rows.every(r => r.storeId === ctx.storeId), true);
});

test("veritabanı ters zaman aralığını uygulama dışında da reddeder", async () => {
  const a = input("31");
  await assert.rejects(withTenant(tenant.id, tx => tx.insert(schema.staffPlans).values({ ...a, revision: 1, tenantId: tenant.id, storeId: ctx.storeId, endsAt: a.startsAt })), e => (e as { cause?: { code?: string } }).cause?.code === "23514");
  const invalid = await withTenant(tenant.id, tx => tx.select().from(schema.staffPlans).where(and(eq(schema.staffPlans.id, a.id), eq(schema.staffPlans.tenantId, tenant.id))));
  assert.equal(invalid.length, 0);
});
