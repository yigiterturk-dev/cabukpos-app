/** Yönetici şifre kuralı (saf): en az 10 karakter, harf + rakam. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Şifre en az 10 karakter olmalı.";
  if (p.length > 200) return "Şifre çok uzun.";
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return "Şifrede en az bir harf ve bir rakam olmalı.";
  return null;
}
