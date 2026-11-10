// lib/platform/credentials.ts — platform_connections.credentials: kiracı/şube başına API adresi + anahtar.
// AES-256-GCM şifreli JSON (card-vault deseni); düz metin yalnız istek anında bellekte tutulur.
import { z } from "zod";
import { decryptCardToken, encryptCardToken } from "@/lib/billing/card-vault";

export type PlatformApi = { base: string; key: string };

const apiSchema = z.object({
  base: z.string().trim().min(1).max(2048),
  key: z.string().trim().min(1).max(4096),
});

/** Bozuk/anahtar değişmiş kayıtta null; asla fırlatmaz. */
export function readPlatformApi(conn: { credentials: string | null }): PlatformApi | null {
  const plain = decryptCardToken(conn.credentials);
  if (!plain) return null;
  try {
    const parsed = apiSchema.safeParse(JSON.parse(plain));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** AUTH_SECRET yoksa null döner; çağıran kullanıcıya hata gösterir. */
export function encodePlatformApi(api: PlatformApi | null): string | null {
  return api ? encryptCardToken(JSON.stringify(api)) : null;
}

/** Öncelik: açık cfg (test) → bağlantıya kayıtlı BYOK → env (sandbox/geri uyum). */
export function platformApi(
  conn: { credentials: string | null },
  envBase: string | undefined,
  envKey: string | undefined,
  label: string,
  cfg?: PlatformApi,
): PlatformApi {
  const saved = readPlatformApi(conn);
  const base = (cfg?.base ?? saved?.base ?? envBase)?.trim();
  const key = (cfg?.key ?? saved?.key ?? envKey)?.trim();
  if (!base || !key) throw new Error(`${label} entegrasyonu yapılandırılmamış: Yönetim → Pazaryerleri'nde API adresi + anahtar girin.`);
  return { base: base.replace(/\/+$/, ""), key };
}
