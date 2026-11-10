const checks = [];

function required(name, label = name) {
  const value = process.env[name]?.trim();
  checks.push({ ok: Boolean(value), label, detail: value ? "tanımlı" : `${name} eksik` });
}

function requiredSecret(name, label = name, minLength = 32) {
  const value = process.env[name]?.trim();
  const ok = Boolean(value && value.length >= minLength);
  checks.push({ ok, label, detail: ok ? `en az ${minLength} karakter` : `${name} en az ${minLength} karakter olmalı` });
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

function requiredPrice(name, label = name) {
  const value = process.env[name]?.trim();
  const amount = Number(value);
  const ok = Number.isInteger(amount) && amount > 0;
  checks.push({ ok, label, detail: ok ? "pozitif kuruş tutarı" : `${name} pozitif tamsayı kuruş tutarı olmalı` });
}

const production = process.env.NODE_ENV === "production" || process.env.LAUNCH_ENV === "production";
const billing = (process.env.BILLING_PROVIDER || "").trim().toLowerCase();

requiredUrl("APP_URL", "Uygulama URL'si", true);
required("DATABASE_URL", "Uygulama veritabanı");
requiredSecret("AUTH_SECRET", "Oturum sırrı");
requiredSecret("CRON_SECRET", "Cron sırrı");

if (production) {
  const webhook = process.env.AGENT_ALERT_WEBHOOK_URL?.trim();
  const alertEmail = process.env.ALERT_EMAIL?.trim();
  const emailFallbackReady = Boolean(
    alertEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail) &&
    process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim()
  );
  if (webhook) {
    requiredUrl("AGENT_ALERT_WEBHOOK_URL", "Agent alarm webhook'u", true);
  } else if (emailFallbackReady) {
    checks.push({ ok: true, label: "Agent alarm kanalı", detail: "Resend e-posta yedeği hazır" });
  } else {
    checks.push({ ok: false, label: "Agent alarm kanalı", detail: "AGENT_ALERT_WEBHOOK_URL veya ALERT_EMAIL + RESEND_API_KEY + MAIL_FROM gerekli" });
  }
  required("LEGAL_NAME", "Yasal unvan");
  required("LEGAL_ADDRESS", "Yasal adres");
  required("LEGAL_TAX_ID", "Yasal vergi no");
  required("LEGAL_TAX_OFFICE", "Vergi dairesi");
  requiredEmail("LEGAL_EMAIL", "Yasal e-posta");
  required("LEGAL_PHONE", "Yasal telefon");
  requiredPrice("PLAN_PRICE_AYLIK", "Aylık plan fiyatı");
  requiredPrice("PLAN_PRICE_YILLIK", "Yıllık plan fiyatı");
}

if (billing === "paytr") {
  required("PAYTR_MERCHANT_ID", "PayTR merchant ID");
  required("PAYTR_MERCHANT_KEY", "PayTR merchant key");
  required("PAYTR_MERCHANT_SALT", "PayTR merchant salt");
  if (production) checks.push({ ok: process.env.PAYTR_TEST_MODE !== "1", label: "PayTR canlı modu", detail: process.env.PAYTR_TEST_MODE === "1" ? "PAYTR_TEST_MODE=1 production'da kullanılamaz" : "canlı mod" });
} else if (billing && billing !== "fake") {
  checks.push({ ok: false, label: "Abonelik sağlayıcısı", detail: `desteklenmeyen değer: ${billing}` });
}

if (production && billing !== "paytr") checks.push({ ok: false, label: "Production abonelik sağlayıcısı", detail: "BILLING_PROVIDER=paytr olmalı; fake sağlayıcı yalnız yerel/test içindir" });

// Sahte sağlayıcı kaçış kapısı yalnız yerel production E2E'si içindir; canlıda açık olamaz.
if (production) checks.push({ ok: process.env.ALLOW_FAKE_PROVIDERS !== "1", label: "Sahte sağlayıcı kaçış kapısı", detail: process.env.ALLOW_FAKE_PROVIDERS === "1" ? "ALLOW_FAKE_PROVIDERS=1 production'da kullanılamaz" : "kapalı" });

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

// Entegrasyon hazırlığı: yalnız açıkça etkinleştirilmiş sağlayıcılar için zorunlu.
const platforms = [
  { flag: "GETIR_ENABLED", label: "Getir", base: "GETIR_API_BASE", keys: ["GETIR_API_KEY"] },
  { flag: "YEMEKSEPETI_ENABLED", label: "Yemeksepeti", base: "YEMEKSEPETI_API_BASE", keys: ["YEMEKSEPETI_API_KEY"] },
  { flag: "TRENDYOL_ENABLED", label: "Trendyol Go", base: "TRENDYOL_API_BASE", keys: ["TRENDYOL_API_KEY"] },
  { flag: "MIGROS_ENABLED", label: "Migros Yemek", base: "MIGROS_API_BASE", keys: ["MIGROS_API_KEY"] },
  { flag: "TIKLAGELSIN_ENABLED", label: "Tıkla Gelsin", base: "TIKLAGELSIN_API_BASE", keys: ["TIKLAGELSIN_API_KEY"] },
];
for (const p of platforms) {
  if (process.env[p.flag] !== "1") continue;
  requiredUrl(p.base, `${p.label} API adresi`, production);
  for (const k of p.keys) required(k, `${p.label}: ${k}`);
}

if (process.env.TRENDYOL_YEMEK_ENABLED === "1") {
  if (process.env.TRENDYOL_YEMEK_API_BASE?.trim()) requiredUrl("TRENDYOL_YEMEK_API_BASE", "Trendyol Yemek API adresi", production);
  for (const k of ["TRENDYOL_YEMEK_SUPPLIER_ID", "TRENDYOL_YEMEK_STORE_ID", "TRENDYOL_YEMEK_API_KEY", "TRENDYOL_YEMEK_API_SECRET", "TRENDYOL_YEMEK_AGENT", "TRENDYOL_YEMEK_EXECUTOR", "TRENDYOL_YEMEK_TENANT_ID"]) {
    required(k, `Trendyol Yemek: ${k}`);
  }
}

if (process.env.MARKETING_SMS_ENABLED === "1") {
  const smsProvider = (process.env.MARKETING_SMS_PROVIDER || "http").trim().toLowerCase();
  if (smsProvider === "netgsm") {
    required("NETGSM_USERNAME", "Netgsm kullanıcı adı");
    required("NETGSM_PASSWORD", "Netgsm parolası");
    required("NETGSM_HEADER", "Netgsm SMS başlığı");
    if (process.env.NETGSM_API_BASE?.trim()) requiredUrl("NETGSM_API_BASE", "Netgsm API adresi", production);
  } else if (smsProvider === "iletimerkezi") {
    required("ILETIMERKEZI_USERNAME", "İletimerkezi kullanıcı adı");
    required("ILETIMERKEZI_PASSWORD", "İletimerkezi parolası");
    required("ILETIMERKEZI_SENDER", "İletimerkezi gönderen");
    if (process.env.ILETIMERKEZI_API_BASE?.trim()) requiredUrl("ILETIMERKEZI_API_BASE", "İletimerkezi API adresi", production);
  } else if (smsProvider === "http" || smsProvider === "generic") {
    requiredUrl("MARKETING_SMS_API_BASE", "Pazarlama SMS API adresi", production);
    required("MARKETING_SMS_API_KEY", "Pazarlama SMS API anahtarı");
    required("MARKETING_SMS_FROM", "Pazarlama SMS gönderen");
  } else {
    checks.push({ ok: false, label: "Pazarlama SMS sağlayıcısı", detail: `desteklenmeyen değer: ${smsProvider}` });
  }
}

if (process.env.YNR_API_BASE?.trim()) {
  requiredUrl("YNR_API_BASE", "Dış kurye API adresi", production);
  required("YNR_TOKEN", "Dış kurye token");
}

if (production) {
  const fiscalOverride = process.env.FISCAL_PROVIDER_OVERRIDE?.trim();
  checks.push({ ok: !fiscalOverride, label: "Mali sağlayıcı kaçış kapısı", detail: fiscalOverride ? "FISCAL_PROVIDER_OVERRIDE production'da kullanılamaz" : "kapalı" });
}

if (process.env.LAUNCH_RUNTIME_CHECK === "1") {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    checks.push({ ok: false, label: "Runtime route doğrulaması", detail: "APP_URL gerekli" });
  } else {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(process.execPath, ["scripts/runtime-audit.mjs"], {
      env: { ...process.env, BASE: appUrl }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    checks.push({ ok: result.status === 0, label: "Runtime route doğrulaması", detail: result.status === 0 ? "health/ready ve korumalı Growth rotaları geçti" : "APP_URL runtime audit başarısız; deployment 404 veya auth sözleşmesi kontrol edilmeli" });
  }
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "OK" : "MISS"} ${check.label}: ${check.detail}`);

if (failed.length) {
  console.error(`\nLaunch check başarısız: ${failed.length} eksik/uygunsuz ayar.`);
  process.exitCode = 1;
} else {
  console.log(`\nLaunch check başarılı: ${checks.length} kontrol.`);
}
