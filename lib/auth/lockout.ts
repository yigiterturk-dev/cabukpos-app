/** Başarısız giriş kilidi (saf): eşik kadar hata birikince pencere boyunca giriş kilitlenir. */

export const FAIL_THRESHOLD = 5;
export const WINDOW_MINUTES = 15;

export function failKey(email: string): string {
  return `hata:${email.toLowerCase()}`;
}

export function shouldLock(failCount: number): boolean {
  return failCount >= FAIL_THRESHOLD;
}
