// Ödeme diyaloğu hızlı nakit tuşları: tutarın üstündeki yuvarlak değerler (kuruş). Tam tutar ayrı tuş.
const STEPS = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000].map((tl) => tl * 100);

export function quickCash(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  for (const s of STEPS) {
    const v = Math.ceil(total / s) * s;
    if (v > total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}
