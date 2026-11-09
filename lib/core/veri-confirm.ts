// lib/core/veri-confirm.ts — hesap silme onayı. Saf fonksiyon: server-only yok, test edilebilir.
// Türkçe küçültme ile "İ"→"i" farkı affedilir; yanlış ad affedilmez.

export function isimEslesiyor(girilen: string, gercek: string): boolean {
  const norm = (v: string) => v.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
  if (!gercek.trim()) return false;
  return norm(girilen) === norm(gercek);
}
