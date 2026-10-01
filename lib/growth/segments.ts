export const GROWTH_SEGMENTS = {
  dormant_30: { label: "30 gündür gelmeyen", hint: "Geri kazanım" },
  active_30: { label: "Son 30 günde aktif", hint: "Tekrar sipariş / sepet büyütme" },
  all_consented: { label: "Tüm izinliler", hint: "Genel duyuru" },
} as const;

export type GrowthSegment = keyof typeof GROWTH_SEGMENTS;

export const isGrowthSegment = (value: string): value is GrowthSegment => value in GROWTH_SEGMENTS;
