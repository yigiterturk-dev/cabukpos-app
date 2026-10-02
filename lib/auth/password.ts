import { createHash } from "node:crypto";

/** Yönetici şifre kuralı (saf): en az 10 karakter, harf + rakam, yaygın şifre olmamalı. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Şifre en az 10 karakter olmalı.";
  if (p.length > 200) return "Şifre çok uzun.";
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return "Şifrede en az bir harf ve bir rakam olmalı.";
  const q = p.toLowerCase();
  if (YAYGIN.includes(q)) return "Bu şifre çok yaygın. Farklı bir şifre seçin.";
  return null;
}

/** Eşzamanlı kural + sızma listesi (HIBP). Ağ/servis hatasında engelleme yok (fail-open). */
export async function passwordProblemAsync(p: string): Promise<string | null> {
  const pw = passwordProblem(p);
  if (pw) return pw;
  if (await sızmaListesinde(p)) return "Bu şifre sızma listelerinde göründü. Lütfen farklı bir şifre seçin.";
  return null;
}

/** En sık kullanılan hazır şifreler (kuraldan zaten geçemeyen kısa/saf olanlar hariç). */
const YAYGIN = ["password1", "password12", "password123", "qwerty123", "qwertyuiop1", "1q2w3e4r5t6y", "asdfghjkl1", "123456789a", "12345678a", "abcd1234ab"];

/** HIBP k-anonymity: hash'in ilk 5 karakteri gönderilir, tam şifre asla gitmez. */
async function sızmaListesinde(p: string): Promise<boolean> {
  try {
    const hash = createHash("sha1").update(p).digest("hex").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "add-padding": "true" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    const son = hash.slice(5);
    return body.split("\n").some((satir) => satir.split(":")[0]?.trim() === son);
  } catch {
    return false;
  }
}
