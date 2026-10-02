// lib/core/png.ts — PNG → 1 bit logo (raster() girdisi). Yükleme anında (tarayıcı/Node) çalışır; inflate için DecompressionStream kullanır.
import { packBits, toBase64, type PaperWidth } from "./escpos";

/** Fiş kağıdına göre logo tavan genişliği (nokta). */
export const logoMaxWidth = (w: PaperWidth) => (w === 58 ? 384 : 576);
export const LOGO_MAX_H = 240;

export type LogoImg = { w: number; h: number; data: string }; // data: packBits çıktısı base64

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function inflate(z: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const resp = new Response(new Blob([z as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await resp.arrayBuffer());
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** IDAT piksellerini (filtre uygulanmış) çözüp RGBA'ya normalize eder. */
function pixels(ihdr: { w: number; h: number; depth: number; ct: number }, plte: Uint8Array, trns: Uint8Array | null, raw: Uint8Array): Uint8Array {
  const { w, h, depth, ct } = ihdr;
  const ch = ct === 2 ? 3 : ct === 4 ? 2 : ct === 6 ? 4 : 1;
  const bpp = Math.max(1, (ch * depth) / 8);
  const stride = Math.ceil((w * ch * depth) / 8);
  if (raw.length < (stride + 1) * h) throw new Error("PNG verisi eksik.");
  const px = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  const mask = (1 << depth) - 1;
  const sample = (buf: Uint8Array, i: number) => (depth === 8 ? buf[i] : (buf[(i * depth) >> 3] >> (8 - depth - ((i * depth) & 7))) & mask);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    line.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      if (ft === 1) line[x] = (v + a) & 0xff;
      else if (ft === 2) line[x] = (v + b) & 0xff;
      else if (ft === 3) line[x] = (v + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) line[x] = (v + paeth(a, b, c)) & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const i = x * ch;
      let r = 0, g = 0, bl = 0, al = 255;
      if (ct === 0) { r = g = bl = sample(line, i); }
      else if (ct === 2) { r = sample(line, i); g = sample(line, i + 1); bl = sample(line, i + 2); }
      else if (ct === 3) {
        const idx = sample(line, i);
        if (idx * 3 + 2 >= plte.length) throw new Error("Palet indeksi taşması.");
        r = plte[idx * 3]; g = plte[idx * 3 + 1]; bl = plte[idx * 3 + 2];
        al = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ct === 4) { r = g = bl = sample(line, i); al = sample(line, i + 1); }
      else { r = sample(line, i); g = sample(line, i + 1); bl = sample(line, i + 2); al = sample(line, i + 3); }
      const o = (y * w + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = bl; px[o + 3] = al;
    }
    prev.set(line);
  }
  return px;
}

/** PNG baytlarını siyah/beyaz satır haritasına çevirir (0 beyaz, 1 siyah). Yalnız interlace'siz PNG. */
export async function pngRows(bytes: Uint8Array): Promise<(0 | 1)[][]> {
  if (bytes.length < 8 || SIG.some((s, i) => bytes[i] !== s)) throw new Error("Dosya PNG değil.");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let ihdr: { w: number; h: number; depth: number; ct: number } | null = null;
  let plte: Uint8Array<ArrayBufferLike> = new Uint8Array(0), trns: Uint8Array<ArrayBufferLike> | null = null;
  const idat: Uint8Array<ArrayBufferLike>[] = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const len = dv.getUint32(pos), type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const body = bytes.subarray(pos + 8, Math.min(pos + 8 + len, bytes.length));
    if (type === "IHDR") {
      const w = dv.getUint32(pos + 8), h = dv.getUint32(pos + 12);
      const depth = bytes[pos + 16], ct = bytes[pos + 17], comp = bytes[pos + 18], filter = bytes[pos + 19], interlace = bytes[pos + 20];
      if (comp !== 0 || filter !== 0) throw new Error("PNG sıkıştırma yöntemi desteklenmiyor.");
      if (interlace !== 0) throw new Error("Sıkıştırılmış (interlace) PNG desteklenmiyor.");
      if (!w || w > 4096 || !h || h > 4096) throw new Error("PNG boyutu 1-4096 arası olmalı.");
      const okDepth = (ct === 0 || ct === 3) ? [1, 2, 4, 8].includes(depth) : depth === 8;
      if (![0, 2, 3, 4, 6].includes(ct) || !okDepth) throw new Error("PNG renk tipi/derinliği desteklenmiyor (8 bit RGB/RGBA/palet/gri kullanın).");
      ihdr = { w, h, depth, ct };
    } else if (type === "PLTE") plte = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr || !idat.length) throw new Error("PNG görsel verisi bulunamadı.");
  const total = idat.reduce((s, b) => s + b.length, 0);
  const zlib = new Uint8Array(total);
  idat.reduce((o, b) => (zlib.set(b, o), o + b.length), 0);
  const raw = await inflate(zlib);
  const px = pixels(ihdr, plte, trns, raw);
  return Array.from({ length: ihdr.h }, (_, y) =>
    Array.from({ length: ihdr.w }, (_, x): 0 | 1 => {
      const o = (y * ihdr!.w + x) * 4;
      const lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
      return px[o + 3] >= 128 && lum < 128 ? 1 : 0;
    }));
}

/** En-boy oranını koruyarak yalnız küçültür (en yakın komşu), genişliği 8'in katına tamamlar. */
function fit(rows: (0 | 1)[][], maxW: number, maxH: number): (0 | 1)[][] {
  const h = rows.length, w = rows[0].length;
  const scale = Math.min(1, maxW / w, maxH / h);
  const nw = Math.max(8, Math.floor(w * scale)), nh = Math.max(1, Math.floor(h * scale));
  const out: (0 | 1)[][] = Array.from({ length: nh }, (_, y) => {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    return Array.from({ length: nw }, (_, x): 0 | 1 => rows[sy][Math.min(w - 1, Math.floor(x / scale))]);
  });
  const pad = nw % 8;
  return pad ? out.map((r) => [...r, ...Array<0>(8 - pad).fill(0)]) : out;
}

/** PNG → fiş logosu: eşik 128, şeffaflık beyaz sayılır, kağıt genişliğine sığdırır. */
export async function pngToLogo(bytes: Uint8Array, width: PaperWidth): Promise<LogoImg> {
  const packed = packBits(fit(await pngRows(bytes), logoMaxWidth(width), LOGO_MAX_H));
  return { w: packed.width, h: packed.height, data: toBase64(packed.data) };
}
