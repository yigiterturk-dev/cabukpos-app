// lib/legal.ts — Yasal sayfalardaki satıcı bilgisi. Şirket kurulunca env'e yazılır (kod değişmez); boşsa sayfada açıkça eksik görünür.
export const SELLER_MISSING = "[şirket kuruluşunda eklenecek]";
const v = (k: string) => process.env[k]?.trim() || null;

export function seller() {
  return {
    name: v("LEGAL_NAME"),
    address: v("LEGAL_ADDRESS"),
    taxOffice: v("LEGAL_TAX_OFFICE"),
    taxId: v("LEGAL_TAX_ID"),
    mersis: v("LEGAL_MERSIS"),
    email: v("LEGAL_EMAIL") ?? v("SALES_CONTACT"),
    phone: v("LEGAL_PHONE"),
    kep: v("LEGAL_KEP"),
  };
}
export const sellerReady = () => { const s = seller(); return !!(s.name && s.address && s.taxId && s.email); };
export const LEGAL_UPDATED = "29 Eylül 2026";

export const LEGAL_PAGES = [
  { href: "/yasal/kullanim-kosullari", label: "Kullanım koşulları" },
  { href: "/yasal/kvkk", label: "KVKK ve gizlilik" },
  { href: "/yasal/mesafeli-satis", label: "Mesafeli satış sözleşmesi" },
  { href: "/yasal/iade-iptal", label: "İptal ve iade" },
  { href: "/yasal/iletisim", label: "İletişim" },
] as const;
