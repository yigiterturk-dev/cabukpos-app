// lib/core/okc.ts — ÖKC/ETMOS mali cihaz saf yardımcıları (#18). Fiş ancak ÖKC imzasıyla yasal belge olur.
// Yol A (OKC-YOL-HARITASI.md): bulut e-ÖKC/VÖRC çözücü (parasut/uyumsoft) BYOK anahtarla; fake-okc sandbox.
export const OKC_PROVIDERS = [
  { value: "fake-okc", label: "Sanal ÖKC (sandbox)", cloud: false },
  { value: "parasut", label: "Paraşüt e-ÖKC (bulut)", cloud: true },
  { value: "uyumsoft", label: "Uyumsoft e-ÖKC (bulut)", cloud: true },
] as const;
export type OkcProviderName = (typeof OKC_PROVIDERS)[number]["value"];

/** Satışa ilişen mali fiş künyesi — sales.okc ve basılı fişte aynı. */
export type OkcSaleData = { no: string; zNo: number; serial: string; test?: boolean };

/** Mali fiş no: <cihaz seri>-<Z no>-<fiş sıra> (ÖKC fişlerindeki künye düzeni). */
export function okcFiscalNo(serial: string, zNo: number, seq: number): string {
  if (!/^[A-Za-z0-9-]{3,20}$/.test(serial)) throw new Error("Cihaz seri no 3-20 karakter, harf/rakam/tire olmalı");
  if (!Number.isInteger(zNo) || zNo < 0 || zNo > 9999) throw new Error("Z no 0..9999 olmalı");
  if (!Number.isInteger(seq) || seq < 1 || seq > 999_999) throw new Error("Fiş sırası 1..999999 olmalı");
  return `${serial}-${String(zNo).padStart(4, "0")}-${String(seq).padStart(6, "0")}`;
}

/** Basılı fişteki "MALİ FİŞ" bloğu — ekrandaki ve ESC/POS'taki aynı metin. */
export function okcNotes(d: OkcSaleData): { title: string; rows: [string, string][]; notes: string[] } {
  return {
    title: "MALİ FİŞ",
    rows: [["Fiş No", d.no], ["Z No", String(d.zNo)], ["Cihaz", d.serial]],
    notes: d.test ? ["TEST — mali değeri yoktur"] : [],
  };
}

/** Sahte sürücünün Z nosu: satış günü (epoch günü) — durumsuz, tekrar üretilebilir. */
export const zNoOf = (soldAt: Date) => Math.floor(soldAt.getTime() / 86_400_000) % 10_000;
