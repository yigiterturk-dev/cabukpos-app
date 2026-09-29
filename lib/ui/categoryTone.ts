// Kategori rengi: ürünü kasada gözle bulmak için soluk ton. Sınıflar düz metin (Tailwind taraması görsün).
export type Tone = { dot: string; stripe: string };

export const NEUTRAL_TONE: Tone = { dot: "bg-stone-300", stripe: "bg-stone-200" };

const TONES: Tone[] = [
  { dot: "bg-orange-400", stripe: "bg-orange-300" },
  { dot: "bg-sky-400", stripe: "bg-sky-300" },
  { dot: "bg-emerald-400", stripe: "bg-emerald-300" },
  { dot: "bg-violet-400", stripe: "bg-violet-300" },
  { dot: "bg-rose-400", stripe: "bg-rose-300" },
  { dot: "bg-amber-400", stripe: "bg-amber-300" },
  { dot: "bg-teal-400", stripe: "bg-teal-300" },
  { dot: "bg-indigo-400", stripe: "bg-indigo-300" },
];

export function categoryTone(id: string | null | undefined): Tone {
  if (!id) return NEUTRAL_TONE;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return TONES[(h >>> 0) % TONES.length];
}
