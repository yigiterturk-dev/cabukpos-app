// lib/core/options.ts — Ürün seçenekleri (pişirme, ekstra, yarım porsiyon). Saf.
import type { Kurus } from "./money";

export type OptionItem = { id: string; name: string; delta: Kurus }; // delta eksi olabilir (yarım porsiyon)
export type OptionGroup = { id: string; name: string; min: number; max: number; options: OptionItem[] };
export type LineOption = { id: string; name: string; delta: Kurus };

/** Seçilen seçenekleri gruplara göre doğrular; birim fiyat = ürün + farklar (0'ın altına inmez). */
export function validateOptions(price: Kurus, groups: OptionGroup[], picked: string[]):
  { ok: true; unitPrice: Kurus; options: LineOption[] } | { ok: false; error: string } {
  const all = new Map(groups.flatMap((g) => g.options.map((o) => [o.id, { g, o }] as const)));
  const unknown = picked.find((id) => !all.has(id));
  if (unknown) return { ok: false, error: "Bilinmeyen seçenek." };
  if (new Set(picked).size !== picked.length) return { ok: false, error: "Aynı seçenek iki kez seçilmiş." };
  for (const g of groups) {
    const n = picked.filter((id) => all.get(id)!.g.id === g.id).length;
    if (n < g.min) return { ok: false, error: `${g.name}: en az ${g.min} seçim.` };
    if (n > g.max) return { ok: false, error: `${g.name}: en çok ${g.max} seçim.` };
  }
  // Grup sırası, grup içinde seçenek sırası: fişte ve mutfakta hep aynı düzen.
  const options = groups.flatMap((g) => g.options.filter((o) => picked.includes(o.id)).map((o) => ({ id: o.id, name: o.name, delta: o.delta })));
  return { ok: true, unitPrice: Math.max(0, price + options.reduce((a, o) => a + o.delta, 0)), options };
}

/** "Az pişmiş, Ekstra peynir" — satır altı metni. */
export const optionsText = (opts: { name: string }[] | undefined) => (opts ?? []).map((o) => o.name).join(", ");
