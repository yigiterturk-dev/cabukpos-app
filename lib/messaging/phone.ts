// TR telefon → E.164. Sağlayıcıya HER ZAMAN normalize numara gider;
// "0532 123 45 67" ile "+90 532 123 45 67" aynı kişidir, sağlayıcı bunu bilmez.
export function toE164TR(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  // 0XXXXXXXXXX (11) → +90XXXXXXXXXX
  if (d.length === 11 && d.startsWith("0")) return `+90${d.slice(1)}`;
  // XXXXXXXXXX (10, 5 ile başlar) → +90...
  if (d.length === 10 && d.startsWith("5")) return `+90${d}`;
  // 90XXXXXXXXXX (12)
  if (d.length === 12 && d.startsWith("90")) return `+${d}`;
  // Zaten +90... verilmişse
  if (raw.trim().startsWith("+") && d.length >= 11) return `+${d}`;
  return null;
}
