// lib/admin/stock-view.ts — Stok ekranı yardımcıları (saf).
import { isCritical } from "@/lib/core/recipe";
export { formatQty, stockUnitOf } from "@/lib/core/stock";

export const isCriticalRow = (r: { level: number; minStock: number | null }) => isCritical(r.level, r.minStock);
