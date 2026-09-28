// lib/agent/ticket.ts — Kasa → ajan bileti (bulut imzalar, ajan çevrimdışı doğrular). Node + tarayıcı, WebCrypto.
// Biçim: base64url(json{d:cihaz, t:kiracı, exp:saniye}) + "." + base64url(HMAC-SHA256(hubKey, gövde)).
export type TicketClaims = { d: string; t: string; exp: number };

const enc = new TextEncoder();
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const key = (hubKey: string) => crypto.subtle.importKey("raw", enc.encode(hubKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const TICKET_TTL_S = 30 * 86_400;

export async function signTicket(hubKey: string, c: TicketClaims): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(c)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(hubKey), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}

/** Geçerliyse iddialar; imza yanlış, süresi geçmiş ya da bozuksa null. `now` saniye. */
export async function verifyTicket(hubKey: string, ticket: string, now = Math.floor(Date.now() / 1000)): Promise<TicketClaims | null> {
  try {
    const [body, sig, extra] = ticket.split(".");
    if (!body || !sig || extra !== undefined) return null;
    // crypto.subtle.verify sabit zamanlı karşılaştırır
    if (!(await crypto.subtle.verify("HMAC", await key(hubKey), unb64u(sig), enc.encode(body)))) return null;
    const c = JSON.parse(new TextDecoder().decode(unb64u(body))) as TicketClaims;
    if (typeof c.d !== "string" || typeof c.t !== "string" || typeof c.exp !== "number" || c.exp < now) return null;
    return c;
  } catch {
    return null;
  }
}
