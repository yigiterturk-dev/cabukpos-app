// lib/core/access.ts — yönetim paneli yetki kapsamı (saf kurallar).
// Rol sahip/mudur kalır; mudur + storeId = şube müdürü (tek şubeye kilitli),
// mudur + storeId null = zincir merkezi (HQ, tüm şubeler), sahip = işletme sahibi.

export type UserRole = "sahip" | "mudur";
export type AccessActor = { id?: string; role: UserRole; storeId: string | null };

/** Şube müdürü: müdür rolü belirli bir şubeye bağlı. */
export const isBranchManager = (u: AccessActor | null | undefined): boolean => !!u && u.role === "mudur" && u.storeId !== null;

/** Tüm şubeleri görür: sahip ve HQ müdürü. */
export const seesAllStores = (u: AccessActor | null | undefined): boolean => !isBranchManager(u);

/** Şube oluşturma/düzenleme ve şube geçişi yalnız tüm şubeleri görene açık. */
export const canManageStores = (u: AccessActor | null | undefined): boolean => !!u && seesAllStores(u);

/** Kullanıcı yönetimi: sahip + HQ müdürü. Şube müdürü kullanıcı açamaz. */
export const canManageUsers = (u: AccessActor | null | undefined): boolean => !!u && seesAllStores(u);

/** HQ yalnız şube müdürlerini yönetir; sahip ve HQ hesaplarını sahip yönetir. */
export const canManageUser = (actor: AccessActor, target: Pick<AccessActor, "role" | "storeId">): boolean =>
  canManageUsers(actor) && (actor.role === "sahip" || isBranchManager(target));

/** Şube müdürü yalnız kendi şubesinde işlem yapabilir; diğerleri her şubede. */
export const canUseStore = (u: AccessActor | null | undefined, storeId: string | null | undefined): boolean => {
  if (!u) return false;
  if (!isBranchManager(u)) return true;
  return !!storeId && storeId === u.storeId;
};

/** İstenen şubeyi aktörün kapsamına indirger (şube müdüründe sabit). */
export const resolveStore = (u: AccessActor, requested: string | null): string | null => (isBranchManager(u) ? u.storeId : requested);

export type AssignProblem = "role" | "store" | "forbidden";

/**
 * Yeni kullanıcı/erişim ataması kuralları.
 * - sahip rolü her zaman tüm şubelerdedir (storeId taşımaz).
 * - HQ müdürü yalnız şube müdürü açabilir (kendine eşit/yetkili hesap üretemez).
 * - Şube müdürü kullanıcı yönetemez.
 */
export function assignProblem(actor: AccessActor | null | undefined, role: string, storeId: string | null | undefined): AssignProblem | null {
  if (role !== "sahip" && role !== "mudur") return "role";
  const sid = storeId || null;
  if (role === "sahip" && sid) return "store";
  if (!actor || !canManageUsers(actor)) return "forbidden";
  if (actor.role === "sahip") return null;
  return role === "mudur" && sid ? null : "forbidden";
}

/** Mevcut bir hesabın erişimini değiştirme: kendini kilitleme ve alt/üst yetki koruması. */
export function accessChangeProblem(
  actor: AccessActor,
  target: { id: string; role: UserRole; storeId: string | null },
  next: { role: string; storeId: string | null | undefined },
): AssignProblem | "self" | null {
  if (target.id === actor.id) return "self";
  if (!canManageUser(actor, target)) return "forbidden";
  return assignProblem(actor, next.role, next.storeId);
}
