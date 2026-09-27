// Amaca özel JWT'ler (edge + node): her tür ayrı anahtar + audience → biri diğerinin yerine geçemez.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type Aud = "admin" | "cashier";

function key(aud: Aud): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET tanımlı değil veya kısa.");
  return new TextEncoder().encode(`${s}|${aud}`);
}

export async function signJwt(aud: Aud, payload: JWTPayload, seconds: number): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setAudience(aud).setIssuedAt().setExpirationTime(`${seconds}s`).sign(key(aud));
}

export async function verifyJwt(aud: Aud, token: string | undefined): Promise<JWTPayload | null> {
  if (!token) return null;
  try {
    return (await jwtVerify(token, key(aud), { algorithms: ["HS256"], audience: aud })).payload;
  } catch {
    return null;
  }
}
