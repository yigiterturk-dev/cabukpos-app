// lib/core/store.ts — şube türü kuralları (saf). Depo satış yapmaz; kasa cihazı bağlanmaz.
export type StoreKind = "sube" | "depo";

export const isDepot = (kind: StoreKind | null | undefined): boolean => kind === "depo";

/** Yeni şube/şube düzenleme formundan gelen tür. */
export function storeKindProblem(kind: string): string | null {
  return kind === "sube" || kind === "depo" ? null : "Şube türü geçersiz.";
}

/** Kasa cihazı yalnız satış şubesine bağlanır; depo cihazsızdır. */
export function deviceProblem(kind: StoreKind | null | undefined): string | null {
  return isDepot(kind) ? "Merkez depoya kasa cihazı bağlanamaz." : null;
}

/** Depo türü yalnız oluştururken seçilir; mevcut şube satış geçmişi varken depoya çevrilmez. */
export function kindChangeProblem(current: StoreKind, next: StoreKind, hasActivity: boolean): string | null {
  if (current === next) return null;
  if (next === "depo" && hasActivity) return "Satış geçmişi, bağlı cihazı ya da şube müdürü olan şube depoya çevrilemez.";
  return null;
}
