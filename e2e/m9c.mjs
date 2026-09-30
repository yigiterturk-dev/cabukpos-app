// e2e/m9c.mjs — Ajans erişimi. Kayıt → Entegrasyonlar → anahtar üret → uç 200 (işletme adı, days dizi) →
// 400 (ters aralık) → İptal et → 401. Satış sayımı DB testinde (tests/integration-db.test.ts).
// Kullanım: npm run build && node --env-file=.env.local e2e/m9c.mjs (sunucu :3800)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testIp = `198.51.100.${(stamp % 250) + 1}`;
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };
const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const api = (key, q = `from=${day}&to=${day}`) => fetch(`${BASE}/api/v1/stats/daily?${q}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp } })).newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m9c-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  expect((await api(null)).status, 401, "anahtarsız");
  await admin.goto(`${BASE}/yonetim/entegrasyonlar`);
  await admin.fill("input[name=name]", "Zirve Ajans");
  await admin.getByRole("button", { name: "Ajans erişimi oluştur" }).click();
  const key = (await admin.getByTestId("integration-key").innerText()).trim();
  if (!/^cpk_[A-Za-z0-9_-]{43}$/.test(key)) throw new Error(`anahtar biçimi: ${key}`);
  step("anahtar üretildi, bir kez gösterildi");

  const r = await api(key);
  expect(r.status, 200, "anahtarla");
  const body = await r.json();
  expect(body.business.name, tenant, "işletme adı");
  if (!Array.isArray(body.days)) throw new Error("days dizi değil");
  expect((await api(key, `from=${day}&to=2020-01-01`)).status, 400, "ters aralık");
  step("uç: 200 (işletme adı, days) + 400 ters aralık");

  await admin.reload();
  await admin.getByTestId("key-row").getByText(/son kullanım/).waitFor();
  await admin.getByRole("button", { name: "İptal et" }).click();
  await admin.getByTestId("key-row").getByText("İptal", { exact: true }).waitFor();
  expect((await api(key)).status, 401, "iptal sonrası");
  step("son kullanım görünür; İptal et → 401");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M9c OK");
} finally {
  await browser.close();
}
