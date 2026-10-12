export const ADMIN_COOKIE = "cz_session";

/** Yönetici oturumu toplam ömrü (yenilenmezse): 14 gün. */
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 14;
/** Kayan yenileme eşiği: jeton yaşı bunu aşınca etkinlikte yeni 14 gün verilir. */
export const ADMIN_SESSION_RENEW_AFTER = 60 * 60 * 24;

/** Saf karar: jeton `iat`'ı eşiği aştıysa kayan yenileme yap. `iat` yoksa yenileme (eski jeton uyumu). */
export function shouldRenewSession(iat: unknown, now: number): boolean {
  return typeof iat !== "number" || now - iat > ADMIN_SESSION_RENEW_AFTER;
}

/** Secure çerezi yalnız https'te: Safari http://localhost'ta Secure çerezi reddeder — yerel prod önizlemede oturum düşer. */
export function secureByProto(proto: string | null | undefined): boolean {
  return proto === "https";
}
