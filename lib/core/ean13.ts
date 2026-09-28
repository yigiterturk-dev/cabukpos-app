// lib/core/ean13.ts — EAN-13 çubuk deseni (95 modül, "1" = siyah). Raf etiketi SVG'si için.
import { ean13Valid } from "./scan";

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((c) => [...c].reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
const R = L.map((c) => [...c].map((b) => (b === "1" ? "0" : "1")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Modules(code: string): string | null {
  if (!ean13Valid(code)) return null;
  const d = [...code].map(Number);
  const par = PARITY[d[0]];
  let s = "101";
  for (let i = 1; i <= 6; i++) s += (par[i - 1] === "L" ? L : G)[d[i]];
  s += "01010";
  for (let i = 7; i <= 12; i++) s += R[d[i]];
  return s + "101";
}
