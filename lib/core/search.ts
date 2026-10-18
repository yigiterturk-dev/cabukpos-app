/** Türkçe karakterleri yazmadan yapılan aramalarda da aynı kelimeyi bulur. */
export function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i");
}
