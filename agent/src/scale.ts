// agent/src/scale.ts — Terazi yanıtı çözümü (saf). Yaygın ECR biçimleri: "ST,GS,+  0.750kg", "  1.234 kg", "750 g".
// "US" (unstable) ya da "?" içeren yanıt kararsız sayılır. Birim yoksa kg varsayılır (ondalıklıysa) ya da gram.
export type ScaleReading = { grams: number; stable: boolean };

export function parseScale(input: Uint8Array | string): ScaleReading | null {
  const s = typeof input === "string" ? input : String.fromCharCode(...input.filter((b) => b >= 0x20 && b < 0x7f));
  const m = /([-+]?)\s*(\d+(?:[.,]\d+)?)\s*(kg|g)?\b/i.exec(s);
  if (!m) return null;
  const n = Number(m[2].replace(",", "."));
  if (!Number.isFinite(n) || m[1] === "-") return null;
  const unit = m[3]?.toLowerCase() ?? (/[.,]/.test(m[2]) ? "kg" : "g");
  const grams = Math.round(unit === "kg" ? n * 1000 : n);
  const stable = !/\bUS\b|\?|\bM\b/.test(s.toUpperCase().replace(/[,]/g, " "));
  return { grams, stable };
}
