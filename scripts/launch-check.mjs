const checks = [];

function required(name, label = name) {
  const value = process.env[name]?.trim();
  checks.push({ ok: Boolean(value), label, detail: value ? "tanımlı" : `${name} eksik` });
}

function requiredUrl(name, label, httpsInProduction = false) {
  const value = process.env[name]?.trim();
  let ok = Boolean(value);
  if (ok) {
    try {
      const parsed = new URL(value);
      ok = parsed.protocol === "http:" || parsed.protocol === "https:";
      if (ok && httpsInProduction && production) ok = parsed.protocol === "https:";
    } catch {
      ok = false;
    }
  }
  checks.push({ ok, label, detail: ok ? "tanımlı" : `${name} geçerli URL olmalı${httpsInProduction && production ? " ve HTTPS kullanmalı" : ""}` });
}

function requiredEmail(name, label = name) {
  const value = process.env[name]?.trim();
  const ok = Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  checks.push({ ok, label, detail: ok ? "tanımlı" : `${name} geçerli e-posta olmalı` });
}

const production = process.env.NODE_ENV === "production" || process.env.LAUNCH_ENV === "production";
const billing = (process.env.BILLING_PROVIDER || "").trim().toLowerCase();

requiredUrl("APP_URL", "Uygulama URL'si", true);
required("DATABASE_URL", "Uygulama veritabanı");
required("AUTH_SECRET", "Oturum sırrı");
required("CRON_SECRET", "Cron sırrı");

if (production) {
  requiredUrl("AGENT_ALERT_WEBHOOK_URL", "Agent alarm webhook'u", true);
  required("LEGAL_NAME", "Yasal unvan");
  required("LEGAL_ADDRESS", "Yasal adres");
  requiredEmail("LEGAL_EMAIL", "Yasal e-posta");
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
