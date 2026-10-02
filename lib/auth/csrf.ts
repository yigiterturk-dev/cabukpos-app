// Uygulama düzeyi CSRF katmanı (Next'in action'lardaki Origin=Host denetimine EK).
// Fikir: tarayıcının gönderdiği fetch-metadata başlıklarını merkezi doğrula —
// form imzalarını bozmadan tüm yönetim aksiyonlarını tek noktadan koru.
//   - Server action çağrısı: POST + `sec-fetch-mode: cors` + `sec-fetch-site: same-origin`
//   - Çapraz site saldırısı (form POST ya da fetch): `cross-site` (veya alt alan adından `same-site`)
//   - Sayfa gezinmesi: `sec-fetch-mode: navigate` → mutasyon değil, denetim yok
// Başlıksız istemciler (curl vb.) bu tehdit modelinin dışı: CSRF tarayıcı saldırısıdır;
// çalınmış çerez ayrı sorun (oturum hırsızlığı), burada çözülmez.

export type FetchMeta = {
  site: string | null;
  mode: string | null;
  origin: string | null;
  host: string | null;
};

/** Saf karar fonksiyonu: "ok" | "red". Test edilebilirliği için headers()'tan ayrı. */
export function csrfVerdict(m: FetchMeta): "ok" | "red" {
  if (m.mode === "navigate") return "ok";
  if (m.site && m.site !== "same-origin" && m.site !== "none") return "red";
  if (m.origin) {
    let originHost: string;
    try {
      originHost = new URL(m.origin).host;
    } catch {
      return "red";
    }
    if (originHost && m.host && originHost !== m.host) return "red";
  }
  return "ok";
}

export class CsrfError extends Error {
  constructor() {
    super("CSRF: çapraz site isteği reddedildi");
    this.name = "CsrfError";
  }
}

/** requireWriter gibi mutasyon kapılarından çağır. Başlıksız istekte (test/cron) sessiz geçer. */
export async function assertCsrf() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const verdict = csrfVerdict({
    site: h.get("sec-fetch-site"),
    mode: h.get("sec-fetch-mode"),
    origin: h.get("origin"),
    host: h.get("x-forwarded-host") ?? h.get("host"),
  });
  if (verdict !== "ok") throw new CsrfError();
}
