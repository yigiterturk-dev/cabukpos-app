// lib/auth/totp.ts — RFC 6238 TOTP (SHA1, 6 hane, 30 sn) + RFC 4648 base32. Saf, sunucu tarafı.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALFABE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ADIM = 30, HANE = 6;

export function base32(bayt: Buffer): string {
  let bit = 0, deger = 0, cikti = "";
  for (const b of bayt) {
    deger = (deger << 8) | b;
    bit += 8;
    while (bit >= 5) {
      cikti += ALFABE[(deger >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) cikti += ALFABE[(deger << (5 - bit)) & 31];
  return cikti;
}

export function base32Coz(s: string): Buffer {
  const temiz = s.replace(/[\s=]/g, "").toUpperCase();
  let bit = 0, deger = 0;
  const cikti: number[] = [];
  for (const c of temiz) {
    const i = ALFABE.indexOf(c);
    if (i < 0) throw new Error("geçersiz base32");
    deger = (deger << 5) | i;
    bit += 5;
    if (bit >= 8) {
      cikti.push((deger >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return Buffer.from(cikti);
}

export const newTotpSecret = () => base32(randomBytes(20));

/** Verilen ana ve zamana ait 6 haneli kod. */
export function totpCode(secret: string, now = Date.now()): string {
  const sayac = Buffer.alloc(8);
  sayac.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / ADIM)));
  const mac = createHmac("sha1", base32Coz(secret)).update(sayac).digest();
  const o = mac[mac.length - 1] & 0xf;
  const kod = (((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 10 ** HANE;
  return String(kod).padStart(HANE, "0");
}

/** Kodu ±1 adım sapmayla doğrular (saat kayması toleransı). */
export function verifyTotp(secret: string, kod: string, now = Date.now()): boolean {
  const k = kod.trim();
  if (!/^\d{6}$/.test(k)) return false;
  const a = Buffer.from(k);
  return [-1, 0, 1].some((kayma) => {
    const b = Buffer.from(totpCode(secret, now + kayma * ADIM * 1000));
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export function otpauthUrl(secret: string, eposta: string): string {
  return `otpauth://totp/${encodeURIComponent(`ÇabukPOS:${eposta}`)}?secret=${secret}&issuer=${encodeURIComponent("ÇabukPOS")}&algorithm=SHA1&digits=6&period=30`;
}
