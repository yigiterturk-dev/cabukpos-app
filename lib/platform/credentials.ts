// lib/platform/credentials.ts — platform_connections.credentials: kiracı/şube başına API adresi + anahtar.
// AES-256-GCM şifreli JSON (card-vault deseni); düz metin yalnız istek anında bellekte tutulur.
import { z } from "zod";
import { decryptCardToken, encryptCardToken } from "@/lib/billing/card-vault";

export type PlatformApi = { base: string; key: string };

const apiSchema = z.object({
  mode: z.literal("sandbox").optional(),
  base: z.string().trim().min(1).max(2048),
  key: z.string().trim().min(1).max(4096),
});

/** Yemeksepeti Partner API: OAuth2 client credentials + zincir/mağaza eşlemesi. */
const partnerSchema = z.object({
  mode: z.literal("partner"),
  base: z.string().trim().url().max(2048).optional(),
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().trim().min(1).max(4096),
  chainId: z.string().trim().min(1).max(200),
  vendorId: z.string().trim().min(1).max(200),
  externalStoreId: z.string().trim().min(1).max(200).optional(),
});

/** Migros Yemek POS entegrasyonu: restoran panelinden alınan üçlü. */
const migrosSchema = z.object({
  mode: z.literal("migros"),
  base: z.string().trim().url().max(2048).optional(),
  chainId: z.string().trim().min(1).max(200),
  restaurantId: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).max(4096),
  externalStoreId: z.string().trim().min(1).max(200).optional(),
});

export type PartnerCredentials = z.infer<typeof partnerSchema>;
export type MigrosCredentials = z.infer<typeof migrosSchema>;
export type ConnectionCredentials =
  | ({ mode: "sandbox" } & PlatformApi)
  | PartnerCredentials
  | MigrosCredentials;

function parseCredentials(conn: { credentials: string | null }): unknown {
  const plain = decryptCardToken(conn.credentials);
  if (!plain) return null;
  try { return JSON.parse(plain); } catch { return null; }
}

/** Bozuk/anahtar değişmiş kayıtta null; asla fırlatmaz. */
export function readPlatformApi(conn: { credentials: string | null }): PlatformApi | null {
  const parsed = apiSchema.safeParse(parseCredentials(conn));
  return parsed.success ? { base: parsed.data.base, key: parsed.data.key } : null;
}

/** Sağlayıcı moduna göre şifreli kimlik kaydını çözer; bozuk kayıtta null. */
export function readConnectionCredentials(conn: { credentials: string | null }): ConnectionCredentials | null {
  const json = parseCredentials(conn);
  const partner = partnerSchema.safeParse(json);
  if (partner.success) return partner.data;
  const migros = migrosSchema.safeParse(json);
  if (migros.success) return migros.data;
  const sandbox = apiSchema.safeParse(json);
  return sandbox.success ? { mode: "sandbox", base: sandbox.data.base, key: sandbox.data.key } : null;
}

export function encodeConnectionCredentials(value: ConnectionCredentials): string | null {
  return encryptCardToken(JSON.stringify(value));
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
