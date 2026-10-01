const checks = [];

function required(name, label = name) {
  const value = process.env[name]?.trim();
  checks.push({ ok: Boolean(value), label, detail: value ? "tanımlı" : `${name} eksik` });
}

const production = process.env.NODE_ENV === "production" || process.env.LAUNCH_ENV === "production";
const billing = (process.env.BILLING_PROVIDER || "").trim().toLowerCase();

required("APP_URL", "Uygulama URL'si");
required("DATABASE_URL", "Uygulama veritabanı");
required("AUTH_SECRET", "Oturum sırrı");
required("CRON_SECRET", "Cron sırrı");

if (production) {
  required("AGENT_ALERT_WEBHOOK_URL", "Agent alarm webhook'u");
  required("LEGAL_NAME", "Yasal unvan");
  required("LEGAL_ADDRESS", "Yasal adres");
  required("LEGAL_EMAIL", "Yasal e-posta");
  required("LEGAL_PHONE", "Yasal telefon");
}

if (billing === "paytr") {
  required("PAYTR_MERCHANT_ID", "PayTR merchant ID");
  required("PAYTR_MERCHANT_KEY", "PayTR merchant key");
  required("PAYTR_MERCHANT_SALT", "PayTR merchant salt");
} else if (billing && billing !== "fake") {
  checks.push({ ok: false, label: "Abonelik sağlayıcısı", detail: `desteklenmeyen değer: ${billing}` });
}

const advisorUrl = process.env.GROWTH_ADVISOR_URL?.trim();
const advisorToken = process.env.GROWTH_ADVISOR_TOKEN?.trim();
if (advisorUrl || advisorToken) {
  let ok = Boolean(advisorUrl && advisorToken);
  if (ok) {
    try {
      const parsed = new URL(advisorUrl);
      ok = !production || parsed.protocol === "https:";
    } catch {
      ok = false;
    }
  }
  checks.push({ ok, label: "Growth/Laya danışmanı", detail: ok ? "URL + token tanımlı" : "URL/token birlikte ve production'da HTTPS olmalı" });
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "OK" : "MISS"} ${check.label}: ${check.detail}`);

if (failed.length) {
  console.error(`\nLaunch check başarısız: ${failed.length} eksik/uygunsuz ayar.`);
  process.exitCode = 1;
} else {
  console.log(`\nLaunch check başarılı: ${checks.length} kontrol.`);
}
