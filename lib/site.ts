/** Site genel ayarları: kanonik adres ve piyasaya çıkış dizinleme kapısı. */

export function siteUrl(): string {
  return (process.env.APP_URL ?? "https://cabukpos.com").replace(/\/+$/, "");
}

/** Piyasaya çıkışa kadar arama motorlarına kapalı; LAUNCH_PUBLIC=1 ile açılır. */
export function indexable(): boolean {
  return process.env.LAUNCH_PUBLIC === "1";
}
