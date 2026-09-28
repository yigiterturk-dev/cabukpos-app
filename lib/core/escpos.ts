// lib/core/escpos.ts — Saf ESC/POS kodlayıcı (termal fiş yazıcısı). Kasa baytı üretir, ajan yalnız iletir.
export type Codepage = "pc857" | "ascii";
export type PaperWidth = 58 | 80;
export const charsPerLine = (w: PaperWidth) => (w === 58 ? 32 : 48);

// PC857 (Türkçe) — ESC t 13 (Epson/XPrinter). Yalnız ASCII dışı gereken harfler.
const PC857: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b, î: 0x8c, ı: 0x8d,
  Ä: 0x8e, É: 0x90, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, İ: 0x98, Ö: 0x99, Ü: 0x9a, Ş: 0x9e, ş: 0x9f,
  á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, Ğ: 0xa6, ğ: 0xa7,
};
const ASCII: Record<string, string> = { Ç: "C", ç: "c", Ğ: "G", ğ: "g", İ: "I", ı: "i", Ö: "O", ö: "o", Ş: "S", ş: "s", Ü: "U", ü: "u", â: "a", î: "i", û: "u", é: "e" };

/** Metni yazıcı baytına çevirir. "₺" → "TL"; tabloda olmayan karakter "?". */
export function encodeText(s: string, cp: Codepage): number[] {
  const out: number[] = [];
  for (const ch of s.replace(/₺/g, "TL").replace(/[  ]/g, " ")) {
    const c = ch.charCodeAt(0);
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (ch === "\n") out.push(0x0a);
    else if (cp === "pc857" && PC857[ch] !== undefined) out.push(PC857[ch]);
    else if (ASCII[ch]) out.push(ASCII[ch].charCodeAt(0));
    else out.push(0x3f);
  }
  return out;
}

/** Görünür uzunluk (₺ yazıcıda "TL" olur). */
const vlen = (s: string) => s.replace(/₺/g, "TL").length;

/** Sol + sağ metni tam `width` karaktere yerleştirir; sol taşarsa kısaltılır. */
export function cols(left: string, right: string, width: number): string {
  const r = right.replace(/₺/g, "TL");
  const room = Math.max(0, width - r.length - 1);
  const l = vlen(left) > room ? left.replace(/₺/g, "TL").slice(0, room) : left.replace(/₺/g, "TL");
  return l + " ".repeat(width - l.length - r.length) + r;
}

/** Uzun metni sözcük sınırından satırlara böler. */
export function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.replace(/₺/g, "TL").split(/\s+/)) {
    if (!w) continue;
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += " " + w;
    else { out.push(line); line = w; }
    while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width); }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export const DRAWER_PULSE = [0x1b, 0x70, 0x00, 0x19, 0xfa];

export class EscPos {
  private b: number[] = [];
  readonly cp: Codepage;
  readonly width: PaperWidth;
  constructor(cp: Codepage = "pc857", width: PaperWidth = 80) {
    this.cp = cp;
    this.width = width;
    this.b.push(0x1b, 0x40); // ESC @ başlat
    if (cp === "pc857") this.b.push(0x1b, 0x74, 13); // ESC t 13
  }
  get cols() { return charsPerLine(this.width); }
  align(a: "left" | "center" | "right") { this.b.push(0x1b, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2); return this; }
  bold(on: boolean) { this.b.push(0x1b, 0x45, on ? 1 : 0); return this; }
  /** Çift yükseklik/genişlik (GS !). Çift genişlikte satır sığası yarıya iner. */
  size(h: 1 | 2, w: 1 | 2 = 1) { this.b.push(0x1d, 0x21, ((w - 1) << 4) | (h - 1)); return this; }
  text(s: string) { this.b.push(...encodeText(s, this.cp)); return this; }
  line(s = "") { return this.text(s).raw(0x0a); }
  lines(s: string) { for (const l of wrap(s, this.cols)) this.line(l); return this; }
  cols2(left: string, right: string) { return this.line(cols(left, right, this.cols)); }
  rule(ch = "-") { return this.line(ch.repeat(this.cols)); }
  feed(n = 1) { this.b.push(0x1b, 0x64, n); return this; }
  cut() { this.b.push(0x1d, 0x56, 0x42, 0x03); return this; } // GS V 66 3: besle + kısmi kes
  drawer() { this.b.push(...DRAWER_PULSE); return this; }
  raw(...n: number[]) { this.b.push(...n); return this; }
  bytes() { return Uint8Array.from(this.b); }
}

export const toBase64 = (u: Uint8Array) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
export const fromBase64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
