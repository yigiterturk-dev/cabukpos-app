// components/kasa/kasa-format.ts — Kasanın para birimi yardımcıları (#16). Cihaz kataloğundaki
// tenants.currency'den türetilir; fiş + ekran + SMS aynı içerik kuralı: TRY "12,50 ₺", diğerleri ISO kodu.
import { formatReceipt, parseMoney, type Currency, type Kurus } from "@/lib/core/money";

type MetaLike = { device?: { currency?: Currency } | null } | null | undefined;

const bare = (k: Kurus) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(k / 100);

/** Ekran biçimlendirici (TL), biçimli girdiyi kuruşa çözen parse ve girdi alanları için sade ondalık. */
export const kasaFmt = (meta: MetaLike) => ({
  TL: (k: Kurus) => formatReceipt(k, meta?.device?.currency),
  parse: parseMoney,
  /** Girdi kutularına yazılacak sade ondalık ("12,50") — para birimi etiketsiz. */
  bare,
});
