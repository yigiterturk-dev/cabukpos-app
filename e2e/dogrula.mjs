// e2e/dogrula.mjs — #4: kayıt → banner → AUTH_SECRET ile imzalanmış bağlantı → doğrulandı → banner kalkar →
// ikinci kullanım "zaten" → bozuk bağlantı başarısız sayfası.
// Kullanım: npm run build && node --env-file=.env.local e2e/dogrula.mjs (sunucu :3800). Canlıda koşmaz (AUTH_SECRET yerel).
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const email = `dogrula-${stamp}@ornek.com`;
const step = (m) => console.log("•", m);
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const dogrulaToken = async (id, mail) =>
  new SignJWT({ sub: id, em: mail }).setProtectedHeader({ alg: "HS256" }).setAudience("dogrula").setIssuedAt().setExpirationTime("86400s")
    .sign(new TextEncoder().encode(`${process.env.AUTH_SECRET}|dogrula`));

try {
  // — Kayıt: panelde doğrulama bannerı —
  const p = await page();
  await p.goto(`${BASE}/kayit`);
  await p.fill("input[name=businessName]", `E2E Doğrula ${stamp}`);
  await p.getByText("Restoran", { exact: true }).click();
  await p.fill("input[name=name]", "Yiğit Test");
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", "Cabukpos2026x");
  await p.getByRole("button", { name: "Hesap oluştur" }).click();
  await p.waitForURL(`${BASE}/yonetim**`, { timeout: 20000 });
  await p.getByText("E-postanız doğrulanmadı").waitFor();
  step("kayıt: panelde doğrulama bannerı var");

  // — Bağlantıyı yerelde imzala (AUTH_SECRET bizde) —
  const [u] = await sql`select id from users where email = ${email}`;
  const token = await dogrulaToken(u.id, email);
  step("bağlantı üretildi (AUTH_SECRET, yerel)");

  // — Doğrulama —
  await p.goto(`${BASE}/dogrula?t=${token}`);
  await p.getByText("E-postanız doğrulandı").waitFor();
  step("/dogrula: hesap doğrulandı");

  await p.goto(`${BASE}/yonetim`);
  await p.getByText("E-postanız doğrulanmadı").waitFor({ state: "detached", timeout: 10000 });
  step("panel bannerı kalktı");

  // — Aynı bağlantı ikinci kez: zaten doğrulanmış —
  await p.goto(`${BASE}/dogrula?t=${token}`);
  await p.getByText("Zaten doğrulanmış").waitFor();
  step("ikinci kullanım: zaten doğrulanmış");

  // — Bozuk bağlantı: başarısız sayfası —
  await p.goto(`${BASE}/dogrula?t=${"x".repeat(40)}`);
  await p.getByText("Doğrulama başarısız").waitFor();
  step("bozuk bağlantı: başarısız sayfası");
} finally {
  await sql.end();
  await browser.close();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("DOGRULA OK");
