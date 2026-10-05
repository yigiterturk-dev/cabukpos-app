// e2e/mfa.mjs — #1: 2FA kurulumu (TOTP) → çıkış → kodla giriş → yanlış kod reddi → kapatma.
// Kullanım: node --env-file=.env.local e2e/mfa.mjs (sunucu :3800, bkz. m1.mjs)
import { chromium } from "playwright-core";
import { createHmac } from "node:crypto";

// TOTP (RFC 6238) — lib/auth/totp ile aynı, e2e bağımsız çalışsın diye kopya.
const ALFABE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totpCode(secret, now = Date.now()) {
  let bit = 0, deger = 0; const bayt = [];
  for (const c of secret.replace(/\s=/g, "").toUpperCase()) {
    const i = ALFABE.indexOf(c); if (i < 0) continue;
    deger = (deger << 5) | i; bit += 5;
    if (bit >= 8) { bayt.push((deger >>> (bit - 8)) & 255); bit -= 8; }
  }
  const sayac = Buffer.alloc(8);
  sayac.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const mac = createHmac("sha1", Buffer.from(bayt)).update(sayac).digest();
  const o = mac[mac.length - 1] & 0xf;
  return String((((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, "0");
}

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const step = (m) => console.log("•", m);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};

try {
  // — Kayıt —
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", "E2E 2FA");
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `mfa-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  // — 2FA kur: gizli anahtarı ekrandan oku, kodu kendi hesaplayıcımızla üret —
  await admin.goto(`${BASE}/yonetim/guvenlik`);
  await admin.getByRole("button", { name: "Kurulumu başlat" }).click();
  const secretEl = admin.locator("p.font-mono");
  await secretEl.waitFor().catch(async () => { console.log("GUVENLIK:", (await admin.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 600)); throw new Error("gizli anahtar görünmedi"); });
  const secret = (await secretEl.innerText()).trim();
  const kod = totpCode(secret);
  await admin.getByLabel("Uygulamadaki 6 haneli kod").fill(kod);
  await admin.getByRole("button", { name: "Kodu doğrula ve aç" }).click();
  await admin.getByText("İki adımlı doğrulama açıldı").waitFor();
  step("2FA açıldı (TOTP onaylandı)");

  // — Çıkış → yanlış kod reddedilir —
  await admin.goto(`${BASE}/yonetim/guvenlik`);
  await admin.getByRole("button", { name: "Çıkış" }).click();
  await admin.waitForURL(`${BASE}/giris*`);
  await admin.fill("input[name=email]", `mfa-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.evaluate(() => { const d = document.querySelector("details"); if (d) d.open = true; });
  await admin.getByLabel("2FA kodu").fill("000000");
  await admin.getByRole("button", { name: "Giriş yap" }).click();
  await admin.getByText(/2FA kodu hatalı/).waitFor();
  step("yanlış kod reddedildi");

  // — Doğru kodla giriş —
  await admin.evaluate(() => { const d = document.querySelector("details"); if (d) d.open = true; });
  await admin.getByLabel("2FA kodu").fill(totpCode(secret));
  await admin.getByRole("button", { name: "Giriş yap" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);
  step("doğru kodla giriş başarılı");

  // — 2FA'yı kapat (re-auth şifre) —
  await admin.goto(`${BASE}/yonetim/guvenlik`);
  const kapatForm = admin.locator("form", { has: admin.getByRole("button", { name: "2FA'yı kapat" }) });
  await kapatForm.getByLabel("Şifreniz").fill("Cabukpos2026x");
  await kapatForm.getByRole("button", { name: "2FA'yı kapat" }).click();
  await admin.getByText(/kapatıldı|kapat/i).first().waitFor({ timeout: 10000 });
  step("2FA kapatıldı (re-auth ile)");
} finally {
  await browser.close();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("MFA OK");
