// e2e/m9b.mjs — Abonelik. Kayıt → Deneme 14 gün → (DB) deneme 10 gün önce bitti → kilit bandı →
// ürün kaydı Abonelik'e yönlenir → [ödeme açıksa] başarısız aylık → hata, hâlâ kilitli → yıllık öde → Aktif,
// dönem ~1 yıl → ürün kaydı açık. Ödeme kapalıysa (canlı) ödeme adımları atlanır.
// Kullanım: npm run build && node --env-file=.env.local e2e/m9b.mjs (sunucu :3800)
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testIp = `198.51.100.${(stamp % 250) + 1}`;
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const errors = [];
const text = async (loc) => (await loc.innerText()).trim();
const addProduct = async (p, name) => {
  await p.goto(`${BASE}/yonetim/urunler`);
  await p.fill("input[name=name]", name);
  await p.fill("input[name=price]", "100");
  await p.getByRole("button", { name: "%10", exact: true }).click();
  await p.getByRole("button", { name: "Ürünü kaydet" }).click();
};

try {
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": testIp } })).newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m9b-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/abonelik`);
  expect(await text(admin.getByTestId("billing-state")), "Deneme", "yeni işletme");
  if (!(await text(admin.getByTestId("billing-ends"))).includes("(14 gün)")) throw new Error("deneme 14 gün değil");
  if (await admin.getByTestId("billing-banner").count()) throw new Error("denemenin başında bant olmamalı");
  step("kayıt: Deneme, 14 gün, bant yok");

  await sql`update tenants set trial_ends_at = now() - interval '10 days' where name = ${tenant}`;
  await admin.goto(`${BASE}/yonetim`);
  await admin.getByTestId("billing-banner").getByText(/salt okunur/).waitFor();
  await addProduct(admin, "Adana");
  await admin.waitForURL(/\/yonetim\/abonelik\?kilit=1/);
  await admin.getByRole("alert").getByText(/değişiklik yapılamıyor/).waitFor();
  expect(await text(admin.getByTestId("billing-state")), "Kilitli", "kilit");
  step("deneme 10 gün önce bitti → bant, ürün kaydı Abonelik'e yönlendi");

  if (await admin.getByText("Online ödeme yakında").count()) {
    step("ödeme kapalı (BILLING_PROVIDER yok) → ödeme adımları atlandı");
  } else {
    await admin.getByRole("button", { name: "Aylık öde" }).click();
    await admin.getByText("TEST ÖDEME").waitFor();
    await admin.getByRole("button", { name: "Başarısız" }).click();
    await admin.waitForURL(/sonuc=hata/);
    expect(await text(admin.getByTestId("billing-state")), "Kilitli", "başarısız ödeme sonrası");
    await admin.getByRole("button", { name: "Yıllık öde" }).click();
    await admin.getByRole("button", { name: "Ödemeyi onayla" }).click();
    await admin.waitForURL(/sonuc=ok/);
    expect(await text(admin.getByTestId("billing-state")), "Aktif", "ödeme sonrası");
    const [t] = await sql`select extract(epoch from paid_until - now()) / 86400 as d from tenants where name = ${tenant}`;
    if (!(Number(t.d) > 364 && Number(t.d) <= 366)) throw new Error(`dönem ${t.d} gün`);
    await addProduct(admin, "Adana");
    await admin.getByRole("cell", { name: "Adana", exact: true }).waitFor();
    step("başarısız aylık → hâlâ kilitli; yıllık → Aktif (~365 gün), ürün kaydı açıldı");
  }

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M9b OK");
} finally {
  await browser.close();
  await sql.end();
}
