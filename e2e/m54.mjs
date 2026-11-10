// e2e/m54.mjs — #54: mobil viewport. Telefon (390×844) üzerinde:
// kayıt → mobil panel çekmecesinden gezinme (taşma yok) → ürün ekle → Kiosk/QR bağla →
// menü adresini al → menüden sipariş ver → durum ekranı. Masaüstü viewport'ta da taşma kontrolü.
// Kullanım: npm run build && node --env-file=.env.local e2e/m54.mjs (sunucu :3800)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testIp = `203.0.113.${(stamp % 250) + 1}`;
const tenant = `E2E Mobil ${stamp}`;
const step = (m) => console.log("•", m);
const MOBILE = { width: 390, height: 844 };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const context = async (viewport) =>
  browser.newContext({ viewport, extraHTTPHeaders: { "x-vercel-forwarded-for": testIp, "x-forwarded-proto": "http" } });
const page = async (viewport = MOBILE) => {
  const p = await (await context(viewport)).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
async function noOverflow(p, label) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 2) throw new Error(`${label}: yatay taşma ${over}px (390px viewport)`);
}

try {
  // 1) Mobil viewport'ta kayıt
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Mobil Test");
  await admin.fill("input[name=email]", `m54-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);
  await admin.getByRole("heading", { name: "Bugün" }).waitFor();
  await noOverflow(admin, "panel/Bugün (mobil)");
  step("mobil kayıt + panel render");

  // 2) Mobil çekmece navigasyonu: hamburger → Ürünler → çekmece kapanır
  await admin.getByRole("button", { name: "Menüyü aç" }).click();
  await admin.getByRole("dialog", { name: "Menü" }).waitFor();
  await admin.getByRole("dialog").getByRole("link", { name: "Menü", exact: true }).click();
  await admin.waitForURL(`${BASE}/yonetim/menu`);
  if (await admin.getByRole("dialog", { name: "Menü" }).isVisible().catch(() => false)) throw new Error("çekmece rota değişince kapanmadı");
  await admin.getByRole("link", { name: /Ürünler/ }).first().click();
  await admin.waitForURL(`${BASE}/yonetim/urunler`);
  await admin.getByRole("heading", { name: "Ürünler" }).waitFor();
  await noOverflow(admin, "Ürünler (mobil)");
  step("mobil çekmece navigasyonu + kapanma");

  // 3) Ürün ekle
  await admin.fill("input[name=categoryName]", "Mobil kategori");
  await admin.getByRole("button", { name: "Kategori ekle" }).click();
  await admin.getByText("Mobil kategori").first().waitFor();
  await admin.fill("input[name=name]", "Mobil Tost");
  await admin.fill("input[name=price]", "45");
  await admin.locator("label").filter({ hasText: /^%10$/ }).click();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByText("Mobil Tost").locator("visible=true").first().waitFor();
  step("ürün eklendi");

  // 4) Kiosk/QR bağla
  await admin.goto(`${BASE}/yonetim/platformlar`);
  await admin.getByRole("combobox").click();
  await admin.getByRole("option", { name: "Kiosk / QR" }).click();
  await admin.getByRole("button", { name: "Bağla" }).click();
  await admin.getByTestId("kiosk-qr").waitFor();
  const codeText = await admin.locator("code", { hasText: "/menu/" }).first().innerText();
  const menuPath = codeText.match(/\/menu\/[^\s]+/)?.[0];
  if (!menuPath) throw new Error(`menü adresi çıkarılamadı: ${codeText}`);
  await noOverflow(admin, "Platformlar (mobil)");
  step("Kiosk/QR bağlandı → menü adresi");

  // 5) Herkese açık menüden mobil sipariş
  const guest = await page();
  await guest.goto(`${BASE}${menuPath}`);
  await guest.getByText(tenant).waitFor();
  await noOverflow(guest, "QR menü (mobil)");
  await guest.getByRole("button", { name: "Mobil Tost sepete ekle" }).click();
  await guest.getByRole("button", { name: /Siparişi gönder/ }).click();
  await guest.waitForURL(`${BASE}/menu/**/s/**`);
  await guest.getByTestId("siparis-durum").waitFor();
  await noOverflow(guest, "Sipariş durumu (mobil)");
  step("menüden sipariş → durum ekranı");

  // 6) Masaüstünde de taşma yok (panel)
  const desktop = await page({ width: 1440, height: 900 });
  await desktop.goto(`${BASE}${menuPath}`);
  await desktop.getByText(tenant).waitFor();
  await noOverflow(desktop, "QR menü (masaüstü)");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M54 OK");
} finally {
  await browser.close();
}
