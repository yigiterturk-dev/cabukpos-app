// Plan kataloğu — TEK KAYNAK. Fiyat/etiket başka yerde tekrar tanımlanmaz.
import type { PlanId } from "@/lib/types";

export type Plan = {
  id: PlanId;
  label: string;
  /** Aylık fiyat, TRY (KDV hariç). */
  priceTRY: number;
  /** Ücretsiz plan mı — checkout gerektirmez. */
  free?: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  baslangic: { id: "baslangic", label: "Solo", priceTRY: 2000 },
  profesyonel: { id: "profesyonel", label: "Pro", priceTRY: 3500 },
  isletme: { id: "isletme", label: "Zincir", priceTRY: 5000 },
};

export const PLAN_ORDER: PlanId[] = ["baslangic", "profesyonel", "isletme"];

export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

/** Yükseltme mi? (ücret alınması gereken yön) */
export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return planRank(to) > planRank(from);
}

export function planLabel(id: PlanId): string {
  return PLANS[id].label;
}

export function planPrice(id: PlanId): number {
  return PLANS[id].priceTRY;
}
