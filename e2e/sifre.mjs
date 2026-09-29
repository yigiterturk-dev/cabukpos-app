// e2e/sifre.mjs — Şifre sıfırlama. Kayıt → girişte "Şifremi unuttum" → istek (mail kapalıysa dürüst uyarı, açıksa aynı yanıt)
// → bağlantı (test, AUTH_SECRET + DB özetinden üretir) → yeni şifre → /yonetim → eski şifre reddedilir, yeni şifre girer → aynı bağlantı ikinci kez geçersiz.
// Kullanım: npm run build && node --env-file=.env.local e2e/sifre.mjs (sunucu :3800). Canlıda koşmaz (AUTH_SECRET yerel).
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const email = `sifre-${stamp}@ornek.com`;
const step = (m) => console.log("•", m);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const errors = [];
const newPage = async () => { const p = await (await browser.newContext()).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const login = async (p, pw) => {
  await p.goto(`${BASE}/giris`);
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", pw);
  await p.getByRole("button", { name: "Giriş yap" }).click();
};

try {
  const a = await newPage();
  await a.goto(`${BASE}/kayit`);
  await a.fill("input[name=businessName]", `E2E Şifre ${stamp}`);
  await a.getByRole("button", { name: "Market" }).click();
  await a.fill("input[name=name]", "Yiğit Test");
  await a.fill("input[name=email]", email);
  await a.fill("input[name=password]", "Cabukpos2026x");
  await a.getByRole("button", { name: "Hesap oluştur" }).click();
  await a.waitForURL(`${BASE}/yonetim**`);
  step("kayıt");

  const b = await newPage();
  await b.goto(`${BASE}/giris`);
  await b.getByRole("link", { name: "Şifremi unuttum" }).click();
  await b.waitForURL(`${BASE}/sifremi-unuttum`);
  await b.fill("input[name=email]", email);
  await b.getByRole("button", { name: "Yenileme bağlantısı gönder" }).click();
  await b.getByText(/şifre yenileme bağlantısı gönderdik|E-posta gönderimi şu an kapalı/).waitFor();
  step("istek: yanıt göründü");

  const [u] = await sql`select id, password_hash from users where email = ${email}`;
  const ph = createHash("sha256").update(u.password_hash).digest("base64url").slice(0, 16);
  const token = await new SignJWT({ sub: u.id, ph }).setProtectedHeader({ alg: "HS256" }).setAudience("reset").setIssuedAt().setExpirationTime("3600s")
    .sign(new TextEncoder().encode(`${process.env.AUTH_SECRET}|reset`));

  await b.goto(`${BASE}/sifre-yenile?t=${token}`);
  await b.fill("input[name=password]", "kisa");
  await b.fill("input[name=password]", "YeniSifre2026");
  await b.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await b.waitForURL(`${BASE}/yonetim**`);
  step("yeni şifre kaydedildi → /yonetim");

  const c = await newPage();
  await login(c, "Cabukpos2026x");
  await c.getByText("E-posta veya şifre hatalı.").waitFor();
  await login(c, "YeniSifre2026");
  await c.waitForURL(`${BASE}/yonetim**`);
  step("eski şifre reddedildi, yeni şifreyle giriş");

  // Eski oturum (tokenVersion arttı) düşmeli
  await a.goto(`${BASE}/yonetim/urunler`);
  await a.waitForURL(`${BASE}/giris**`);
  step("şifre değişmeden önceki oturum düştü");

  const d = await newPage();
  await d.goto(`${BASE}/sifre-yenile?t=${token}`);
  await d.fill("input[name=password]", "BaskaSifre2026");
  await d.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await d.getByText("Bağlantı geçersiz ya da süresi dolmuş.").waitFor();
  step("aynı bağlantı ikinci kez geçersiz");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("ŞİFRE OK");
} finally {
  await browser.close();
  await sql.end();
}
