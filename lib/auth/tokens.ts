// lib/auth/tokens.ts — Cihaz eşleme kodu, cihaz jetonu, sha256 (WebCrypto).
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I yok
export function newPairingCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHA[b % ALPHA.length]).join("");
}
export function newDeviceToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
