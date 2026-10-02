// tests/png.test.ts — PNG→1bit logo çözücü + fişe logo basımı (#36 kalanı)
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { fromBase64, packBits } from "@/lib/core/escpos";
import { pngRows, pngToLogo, logoMaxWidth } from "@/lib/core/png";
import { renderReceipt } from "@/lib/core/receipt";

const SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const chunk = (type: string, body: Uint8Array) => {
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, body.length);
  for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
  const crc = new Uint8Array(4); // çözücü CRC doğrulamaz
  const out = new Uint8Array(8 + body.length + 4);
  out.set(head); out.set(body, 8); out.set(crc, 8 + body.length);
  return out;
};
const ihdr = (w: number, h: number, depth: number, ct: number, interlace = 0) => {
  const b = new Uint8Array(13);
  new DataView(b.buffer).setUint32(0, w); new DataView(b.buffer).setUint32(4, h);
  b[8] = depth; b[9] = ct; b[10] = 0; b[11] = 0; b[12] = interlace;
  return chunk("IHDR", b);
};
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  parts.reduce((o, p) => (out.set(p, o), o + p.length), 0);
  return out;
};
const png = (w: number, h: number, depth: number, ct: number, raw: Uint8Array, extra: Uint8Array[] = [], interlace = 0) =>
  cat([SIG, ihdr(w, h, depth, ct, interlace), ...extra, chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);

/** Ham tarama satırı yazar: filter + piksel verisi (satır = 1 + stride). */
const row = (stride: number, y: number, filter: number, px: number[]) => ({ at: y * (stride + 1), filter, px });
const scanlines = (total: number, rows: { at: number; filter: number; px: number[] }[]) => {
  const raw = new Uint8Array(total);
  for (const r of rows) { raw[r.at] = r.filter; raw.set(r.px, r.at + 1); }
  return raw;
};

test("png: 8 bit RGB, siyah/beyaz eşik", async () => {
  const stride = 8 * 3;
  const raw = scanlines(2 * (1 + stride), [
    row(stride, 0, 0, Array.from({ length: stride }, () => 0)), // siyah
    row(stride, 1, 0, Array.from({ length: stride }, () => 255)), // beyaz
  ]);
  const rows = await pngRows(png(8, 2, 8, 2, raw));
  assert.deepEqual(rows, [[1, 1, 1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0, 0, 0]]);
});

test("png: palet (1 bit derinlik) + tRNS şeffaflık", async () => {
  // palet: 0=sarı(şeffaf) 1=siyah
  const plte = Uint8Array.from([255, 255, 0, 0, 0, 0]);
  const trns = Uint8Array.from([0, 255]);
  const raw = Uint8Array.from([0, 0b01000001]); // filtre 0; desen 0,1,0,0,0,0,0,1
  const rows = await pngRows(png(8, 1, 1, 3, raw, [chunk("PLTE", plte), chunk("tRNS", trns)]));
  assert.deepEqual(rows, [[0, 1, 0, 0, 0, 0, 0, 1]]); // şeffaf sarı beyaz sayılır
});

test("png: Up ve Sub filtreleri", async () => {
  const stride = 8 * 3;
  // satır 0: siyah. satır 1: Up fark 0 → siyah. satır 2: Sub → ilk px siyah, 2. fark 255 → beyaz, kalan 0+beyaz → beyaz
  const raw = scanlines(3 * (1 + stride), [
    row(stride, 0, 0, Array.from({ length: stride }, () => 0)),
    row(stride, 1, 2, Array.from({ length: stride }, () => 0)),
    row(stride, 2, 1, [0, 0, 0, 255, 255, 255, ...Array<number>(stride - 6).fill(0)]),
  ]);
  const rows = await pngRows(png(8, 3, 8, 2, raw));
  assert.deepEqual(rows[0], Array<1>(8).fill(1));
  assert.deepEqual(rows[1], Array<1>(8).fill(1));
  assert.deepEqual(rows[2], [1, 0, 0, 0, 0, 0, 0, 0]);
});

test("png: RGBA'da şeffaflık beyazdır", async () => {
  const stride = 8 * 4;
  const raw = scanlines(2 * (1 + stride), [
    row(stride, 0, 0, Array.from({ length: stride }, () => 0)), // tam şeffaf siyah
    row(stride, 1, 0, Array.from({ length: 8 }, () => [30, 30, 30, 255]).flat()), // koyu opak
  ]);
  const rows = await pngRows(png(8, 2, 8, 6, raw));
  assert.deepEqual(rows, [[0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1]]);
});

test("pngToLogo: 80 mm'ye sığar, 8'in katına tamamlanır, fişe GS v 0 olarak basılır", async () => {
  const w = 40, h = 20;
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) raw.set([0, 0, 0], y * (1 + w * 3) + 1 + x * 3);
  const logo = await pngToLogo(png(w, h, 8, 2, raw), 80);
  assert.equal(logo.w, 40); assert.equal(logo.h, 20);
  assert.equal(logo.w % 8, 0);
  const rows = await pngRows(png(w, h, 8, 2, raw));
  const back = packBits(rows);
  assert.deepEqual([...fromBase64(logo.data)], [...back.data]);
  assert.equal(logoMaxWidth(58), 384); assert.equal(logoMaxWidth(80), 576);

  const u = renderReceipt(
    { receiptNo: "K1-1", at: "2026-10-03T10:00:00Z", staffName: "A", lines: [], payments: [], total: 0, change: 0, vat: [] },
    { tenantName: "T", storeName: "M", storeAddress: null },
    { width: 80, codepage: "ascii", logo },
  );
  const ascii = String.fromCharCode(...u);
  const at = ascii.indexOf(String.fromCharCode(0x1d, 0x76, 0x30, 0));
  assert.ok(at > 0);
  assert.deepEqual([...u.slice(at + 4, at + 8)], [40, 0, 20, 0]); // genişlik + yükseklik (LSB önce)
  const first = u[at + 8];
  assert.equal(first & 0x80, 0x80); // ilk piksel siyah
});

test("pngToLogo: geniş görsel küçültülür", async () => {
  const w = 1152, h = 2;
  const raw = new Uint8Array(h * (1 + w * 3));
  const logo = await pngToLogo(png(w, h, 8, 2, raw), 80);
  assert.equal(logo.w, 576); assert.equal(logo.h, 1);
});

test("png: bozuk girdiler reddedilir", async () => {
  await assert.rejects(() => pngRows(Uint8Array.from([1, 2, 3])), /PNG değil/);
  await assert.rejects(() => pngRows(SIG), /görsel verisi bulunamadı/);
  const raw = new Uint8Array(1 * (1 + 8 * 3));
  await assert.rejects(() => pngRows(png(8, 1, 8, 2, raw, [], 1)), /interlace/);
});
